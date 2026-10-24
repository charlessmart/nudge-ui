import { isDemoRuntime } from "../../runtime/runtimeConfig.ts";
import {
  SKETCH_DATABASE_NAME,
  SKETCH_DATABASE_VERSION,
  SKETCH_DOCUMENTS_STORE,
  type SketchDocument,
} from "../../sketch/model.ts";

/** The v1 database also held dispatch handoffs; opening v2 removes that store. */
const LEGACY_HANDOFFS_STORE = "handoffs";

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
}

interface MemoryProjectState {
  documents: Map<string, SketchDocument>;
}

/** One atomic set of puts and deletes against a project's sketch records. */
export interface SketchStorageChange {
  readonly documents?: readonly SketchDocument[];
  readonly deleteDocumentIds?: readonly string[];
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
    state = { documents: new Map() };
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
      request.onupgradeneeded = (event) => {
        const database = request.result;
        if (!database.objectStoreNames.contains(SKETCH_DOCUMENTS_STORE)) {
          const documents = database.createObjectStore(SKETCH_DOCUMENTS_STORE, { keyPath: "id" });
          documents.createIndex("projectId", "projectId", { unique: false });
        }
        if (database.objectStoreNames.contains(LEGACY_HANDOFFS_STORE)) {
          database.deleteObjectStore(LEGACY_HANDOFFS_STORE);
        }
        // v1 documents carried the editable-sketch model; drop them instead of leaving records that no reader accepts.
        if (event.oldVersion > 0 && event.oldVersion < SKETCH_DATABASE_VERSION) {
          request.transaction?.objectStore(SKETCH_DOCUMENTS_STORE).clear();
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
    return { documents: [...state.documents.values()] };
  }
  try {
    const transaction = database.transaction(SKETCH_DOCUMENTS_STORE, "readonly");
    const done = transactionDone(transaction);
    // Records come back as stored; the store drops anything that fails validation during hydration.
    const documentsPromise = requestResult<SketchDocument[]>(
      transaction.objectStore(SKETCH_DOCUMENTS_STORE).index("projectId").getAll(projectId),
    );
    const [documents] = await Promise.all([documentsPromise, done]);
    return { documents };
  } catch (error) {
    throw storageError("Sketch storage could not be read.", error);
  }
}

export async function writeSketchPersistence(
  projectId: string,
  document: SketchDocument,
): Promise<void> {
  if (configuredStorage) {
    return updateConfigured(configuredStorage, projectId, { documents: [document] }, "Sketch could not be saved to browser storage.");
  }
  const database = await openDatabase();
  if (!database) {
    memoryState(projectId).documents.set(document.id, document);
    return;
  }
  try {
    const transaction = database.transaction(SKETCH_DOCUMENTS_STORE, "readwrite");
    transaction.objectStore(SKETCH_DOCUMENTS_STORE).put(document);
    await transactionDone(transaction);
  } catch (error) {
    throw storageError("Sketch could not be saved to browser storage.", error);
  }
}

export async function deleteSketchPersistence(projectId: string, sketchId: string): Promise<void> {
  if (configuredStorage) {
    return updateConfigured(
      configuredStorage,
      projectId,
      { deleteDocumentIds: [sketchId] },
      "Sketch could not be removed from browser storage.",
    );
  }
  const database = await openDatabase();
  if (!database) {
    memoryState(projectId).documents.delete(sketchId);
    return;
  }
  try {
    const transaction = database.transaction(SKETCH_DOCUMENTS_STORE, "readwrite");
    transaction.objectStore(SKETCH_DOCUMENTS_STORE).delete(sketchId);
    await transactionDone(transaction);
  } catch (error) {
    throw storageError("Sketch could not be removed from browser storage.", error);
  }
}

export async function clearSketchPersistence(projectId: string): Promise<void> {
  const existing = await readSketchPersistence(projectId);
  if (configuredStorage) {
    return updateConfigured(
      configuredStorage,
      projectId,
      { deleteDocumentIds: existing.documents.map((document) => document.id) },
      "Sketch storage could not be cleared.",
    );
  }
  const database = await openDatabase();
  if (!database) {
    memoryState(projectId).documents.clear();
    return;
  }
  try {
    const transaction = database.transaction(SKETCH_DOCUMENTS_STORE, "readwrite");
    const documents = transaction.objectStore(SKETCH_DOCUMENTS_STORE);
    existing.documents.forEach((document) => documents.delete(document.id));
    await transactionDone(transaction);
  } catch (error) {
    throw storageError("Sketch storage could not be cleared.", error);
  }
}

/** Test seam for the no-IndexedDB fallback; it does not delete browser data. */
export function resetSketchMemory(): void {
  memoryProjects.clear();
}
