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

export interface SketchPersistenceSnapshot {
  readonly documents: SketchDocument[];
  readonly handoffs: SketchHandoffRecord[];
}

interface MemoryProjectState {
  documents: Map<string, SketchDocument>;
  handoffs: Map<string, SketchHandoffRecord>;
}

const memoryProjects = new Map<string, MemoryProjectState>();
let databasePromise: Promise<IDBDatabase | null> | null = null;

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
      throw new SketchStorageError("Sketch storage is unavailable in this browser.", { cause: error });
    });
  }
  return databasePromise;
}

export async function readSketchPersistence(projectId: string): Promise<SketchPersistenceSnapshot> {
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
    const documentsPromise = requestResult(
      transaction.objectStore(SKETCH_DOCUMENTS_STORE).index("projectId").getAll(projectId),
    ) as Promise<SketchDocument[]>;
    const handoffsPromise = requestResult(
      transaction.objectStore(SKETCH_HANDOFFS_STORE).index("projectId").getAll(projectId),
    ) as Promise<SketchHandoffRecord[]>;
    const [documents, handoffs] = await Promise.all([documentsPromise, handoffsPromise, done]);
    return { documents, handoffs };
  } catch (error) {
    throw new SketchStorageError("Sketch storage could not be read.", { cause: error });
  }
}

/** Writes a document and its initial/current handoff atomically. */
export async function writeSketchPersistence(
  projectId: string,
  document: SketchDocument,
  handoff: SketchHandoffRecord,
): Promise<void> {
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
    throw new SketchStorageError("Sketch could not be saved to browser storage.", { cause: error });
  }
}

export async function writeSketchHandoff(
  projectId: string,
  handoff: SketchHandoffRecord,
): Promise<void> {
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
    throw new SketchStorageError("Sketch handoff state could not be saved.", { cause: error });
  }
}

export async function writeSketchHandoffs(
  projectId: string,
  handoffs: readonly SketchHandoffRecord[],
): Promise<void> {
  if (handoffs.length === 0) return;
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
    throw new SketchStorageError("Sketch handoff state could not be saved.", { cause: error });
  }
}

export async function deleteSketchPersistence(projectId: string, sketchId: string): Promise<void> {
  const existing = await readSketchPersistence(projectId);
  const handoffIds = existing.handoffs
    .filter((handoff) => handoff.sketchId === sketchId)
    .map((handoff) => handoff.id);
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
    throw new SketchStorageError("Sketch could not be removed from browser storage.", { cause: error });
  }
}

export async function clearSketchPersistence(projectId: string): Promise<void> {
  const existing = await readSketchPersistence(projectId);
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
    throw new SketchStorageError("Sketch storage could not be cleared.", { cause: error });
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
