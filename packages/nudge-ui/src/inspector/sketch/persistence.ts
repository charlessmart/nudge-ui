import { isDemoRuntime } from "../runtime/runtimeConfig.ts";
import {
  SKETCH_DATABASE_NAME,
  SKETCH_DATABASE_VERSION,
  SKETCH_DOCUMENTS_STORE,
  SKETCH_HANDOFFS_STORE,
  type SketchDocument,
  type SketchHandoffRecord,
} from "./model.ts";

export class SketchStorageError extends Error {
  readonly code = "sketch_storage_error";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "SketchStorageError";
  }
}

export const SKETCH_STORAGE_FULL_MESSAGE = "Browser storage is full. Remove saved sketches you no longer need, then try again.";

// IndexedDB rejects with a QuotaExceededError; `chrome.storage` with a "quota exceeded" message.
function isQuotaError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "QuotaExceededError") return true;
  return error instanceof Error && /quota/i.test(error.message);
}

function storageError(message: string, error: unknown): SketchStorageError {
  return new SketchStorageError(isQuotaError(error) ? SKETCH_STORAGE_FULL_MESSAGE : message, { cause: error });
}

export interface SketchPersistenceSnapshot {
  readonly documents: SketchDocument[];
  readonly handoffs: SketchHandoffRecord[];
}

interface MemoryProjectState {
  documents: Map<string, SketchDocument>;
  handoffs: Map<string, SketchHandoffRecord>;
}

/** One atomic set of puts and deletes against a project's sketch records. */
export interface SketchStorageChange {
  readonly documents?: readonly SketchDocument[];
  readonly handoffs?: readonly SketchHandoffRecord[];
  readonly deleteDocumentIds?: readonly string[];
  readonly deleteHandoffIds?: readonly string[];
}

/** Replaces the page origin's IndexedDB for sketches, for example with extension storage. */
export interface SketchStorage {
  read(projectId: string): Promise<SketchPersistenceSnapshot>;
  update(projectId: string, change: SketchStorageChange): Promise<void>;
}

const memoryProjects = new Map<string, MemoryProjectState>();
let databasePromise: Promise<IDBDatabase | null> | null = null;
let configuredStorage: SketchStorage | null = null;

export function configureSketchStorage(storage: SketchStorage | null): void {
  configuredStorage = storage;
}

async function updateConfigured(
  storage: SketchStorage,
  projectId: string,
  change: SketchStorageChange,
  message: string,
): Promise<void> {
  try {
    await storage.update(projectId, change);
  } catch (error) {
    throw storageError(message, error);
  }
}

function memoryState(projectId: string): MemoryProjectState {
  let state = memoryProjects.get(projectId);
  if (!state) {
    state = { documents: new Map(), handoffs: new Map() };
    memoryProjects.set(projectId, state);
  }
  return state;
}

function indexedDbFactory(): IDBFactory | null {
  if (typeof indexedDB === "undefined") return null;
  return indexedDB;
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted."));
  });
}

async function openDatabase(): Promise<IDBDatabase | null> {
  const factory = indexedDbFactory();
  if (!factory) return null;
  // Demo runtimes (the landing page) are session-only: sketches live in the
  // in-memory fallback and never touch IndexedDB.
  if (isDemoRuntime()) return null;
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      let request: IDBOpenDBRequest;
      try {
        request = factory.open(SKETCH_DATABASE_NAME, SKETCH_DATABASE_VERSION);
      } catch (error) {
        reject(error);
        return;
      }
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(SKETCH_DOCUMENTS_STORE)) {
          const documents = database.createObjectStore(SKETCH_DOCUMENTS_STORE, { keyPath: "id" });
          documents.createIndex("projectId", "projectId", { unique: false });
        }
        if (!database.objectStoreNames.contains(SKETCH_HANDOFFS_STORE)) {
          const handoffs = database.createObjectStore(SKETCH_HANDOFFS_STORE, { keyPath: "id" });
          handoffs.createIndex("projectId", "projectId", { unique: false });
          handoffs.createIndex("sketchKey", ["sketchId", "sketchRevision"], { unique: false });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => database.close();
        resolve(database);
      };
      request.onerror = () => reject(request.error ?? new Error("IndexedDB could not be opened."));
      request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked by another tab."));
    }).catch((error: unknown) => {
      databasePromise = null;
      throw storageError("Sketch storage is unavailable in this browser.", error);
    });
  }
  return databasePromise;
}

export async function readSketchPersistence(projectId: string): Promise<SketchPersistenceSnapshot> {
  if (configuredStorage) {
    try {
      return await configuredStorage.read(projectId);
    } catch (error) {
      throw storageError("Sketch storage could not be read.", error);
    }
  }
  const database = await openDatabase();
  if (!database) {
    const state = memoryState(projectId);
    return {
      documents: [...state.documents.values()],
      handoffs: [...state.handoffs.values()],
    };
  }
  try {
    const transaction = database.transaction([SKETCH_DOCUMENTS_STORE, SKETCH_HANDOFFS_STORE], "readonly");
    const done = transactionDone(transaction);
    // Records come back as stored; the store drops anything that fails validation during hydration.
    const documentsPromise = requestResult<SketchDocument[]>(
      transaction.objectStore(SKETCH_DOCUMENTS_STORE).index("projectId").getAll(projectId),
    );
    const handoffsPromise = requestResult<SketchHandoffRecord[]>(
      transaction.objectStore(SKETCH_HANDOFFS_STORE).index("projectId").getAll(projectId),
    );
    const [documents, handoffs] = await Promise.all([documentsPromise, handoffsPromise, done]);
    return { documents, handoffs };
  } catch (error) {
    throw storageError("Sketch storage could not be read.", error);
  }
}

export async function writeSketchPersistence(
  projectId: string,
  document: SketchDocument,
  handoff: SketchHandoffRecord,
): Promise<void> {
  if (configuredStorage) {
    const change = { documents: [document], handoffs: [handoff] };
    return updateConfigured(configuredStorage, projectId, change, "Sketch could not be saved to browser storage.");
  }
  const database = await openDatabase();
  if (!database) {
    const state = memoryState(projectId);
    state.documents.set(document.id, document);
    state.handoffs.set(handoff.id, handoff);
    return;
  }
  try {
    const transaction = database.transaction([SKETCH_DOCUMENTS_STORE, SKETCH_HANDOFFS_STORE], "readwrite");
    transaction.objectStore(SKETCH_DOCUMENTS_STORE).put(document);
    transaction.objectStore(SKETCH_HANDOFFS_STORE).put(handoff);
    await transactionDone(transaction);
  } catch (error) {
    throw storageError("Sketch could not be saved to browser storage.", error);
  }
}

export async function writeSketchHandoff(
  projectId: string,
  handoff: SketchHandoffRecord,
): Promise<void> {
  if (configuredStorage) {
    return updateConfigured(configuredStorage, projectId, { handoffs: [handoff] }, "Sketch handoff state could not be saved.");
  }
  const database = await openDatabase();
  if (!database) {
    memoryState(projectId).handoffs.set(handoff.id, handoff);
    return;
  }
  try {
    const transaction = database.transaction(SKETCH_HANDOFFS_STORE, "readwrite");
    transaction.objectStore(SKETCH_HANDOFFS_STORE).put(handoff);
    await transactionDone(transaction);
  } catch (error) {
    throw storageError("Sketch handoff state could not be saved.", error);
  }
}

export async function writeSketchHandoffs(
  projectId: string,
  handoffs: readonly SketchHandoffRecord[],
): Promise<void> {
  if (handoffs.length === 0) return;
  if (configuredStorage) {
    return updateConfigured(configuredStorage, projectId, { handoffs }, "Sketch handoff state could not be saved.");
  }
  const database = await openDatabase();
  if (!database) {
    const state = memoryState(projectId);
    handoffs.forEach((handoff) => state.handoffs.set(handoff.id, handoff));
    return;
  }
  try {
    const transaction = database.transaction(SKETCH_HANDOFFS_STORE, "readwrite");
    const store = transaction.objectStore(SKETCH_HANDOFFS_STORE);
    handoffs.forEach((handoff) => store.put(handoff));
    await transactionDone(transaction);
  } catch (error) {
    throw storageError("Sketch handoff state could not be saved.", error);
  }
}

export async function deleteSketchPersistence(projectId: string, sketchId: string): Promise<void> {
  const existing = await readSketchPersistence(projectId);
  const handoffIds = existing.handoffs
    .filter((handoff) => handoff.sketchId === sketchId)
    .map((handoff) => handoff.id);
  if (configuredStorage) {
    const change = { deleteDocumentIds: [sketchId], deleteHandoffIds: handoffIds };
    return updateConfigured(configuredStorage, projectId, change, "Sketch could not be removed from browser storage.");
  }
  const database = await openDatabase();
  if (!database) {
    const state = memoryState(projectId);
    state.documents.delete(sketchId);
    handoffIds.forEach((id) => state.handoffs.delete(id));
    return;
  }
  try {
    const transaction = database.transaction([SKETCH_DOCUMENTS_STORE, SKETCH_HANDOFFS_STORE], "readwrite");
    transaction.objectStore(SKETCH_DOCUMENTS_STORE).delete(sketchId);
    const handoffs = transaction.objectStore(SKETCH_HANDOFFS_STORE);
    handoffIds.forEach((id) => handoffs.delete(id));
    await transactionDone(transaction);
  } catch (error) {
    throw storageError("Sketch could not be removed from browser storage.", error);
  }
}

export async function clearSketchPersistence(projectId: string): Promise<void> {
  const existing = await readSketchPersistence(projectId);
  if (configuredStorage) {
    const change = {
      deleteDocumentIds: existing.documents.map((document) => document.id),
      deleteHandoffIds: existing.handoffs.map((handoff) => handoff.id),
    };
    return updateConfigured(configuredStorage, projectId, change, "Sketch storage could not be cleared.");
  }
  const database = await openDatabase();
  if (!database) {
    const state = memoryState(projectId);
    state.documents.clear();
    state.handoffs.clear();
    return;
  }
  try {
    const transaction = database.transaction([SKETCH_DOCUMENTS_STORE, SKETCH_HANDOFFS_STORE], "readwrite");
    const documents = transaction.objectStore(SKETCH_DOCUMENTS_STORE);
    const handoffs = transaction.objectStore(SKETCH_HANDOFFS_STORE);
    existing.documents.forEach((document) => documents.delete(document.id));
    existing.handoffs.forEach((handoff) => handoffs.delete(handoff.id));
    await transactionDone(transaction);
  } catch (error) {
    throw storageError("Sketch storage could not be cleared.", error);
  }
}

export async function closeSketchDatabase(): Promise<void> {
  if (!databasePromise) return;
  const database = await databasePromise.catch(() => null);
  database?.close();
  databasePromise = null;
}

/** Test seam for the no-IndexedDB fallback; it does not delete browser data. */
export function resetSketchMemory(): void {
  memoryProjects.clear();
}
