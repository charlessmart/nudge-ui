import { useSyncExternalStore } from "react";
import { canWriteWorkspace } from "../../canvas/workspaceLease.ts";
import { getNudgeUiRuntimeConfig } from "../../runtime/runtimeConfig.ts";
import {
  clearSketchPersistence,
  deleteSketchPersistence,
  readSketchPersistence,
  SketchStorageError,
  writeSketchPersistence,
} from "./persistence.ts";
import {
  SKETCH_LIMITS,
  SKETCH_SCHEMA_VERSION,
  isSketchDocument,
  type SketchDocument,
  type SketchInk,
} from "../../sketch/model.ts";

export interface SaveSketchInput {
  readonly url: string;
  readonly image: Blob;
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly ink?: SketchInk;
}

export interface SketchStoreSnapshot {
  readonly projectId: string | null;
  readonly ready: boolean;
  readonly documents: readonly SketchDocument[];
  readonly error: string | null;
}

const EMPTY_SNAPSHOT: SketchStoreSnapshot = {
  projectId: null,
  ready: false,
  documents: [],
  error: null,
};

let snapshot: SketchStoreSnapshot = EMPTY_SNAPSHOT;
let initialization: Promise<void> | null = null;
let activeProjectId: string | null = null;
let generation = 0;
let writeQueue = Promise.resolve();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A subscriber must not prevent the store from notifying the others.
    }
  }
}

function setSnapshot(next: SketchStoreSnapshot): void {
  snapshot = next;
  notify();
}

function sortDocuments(documents: readonly SketchDocument[]): SketchDocument[] {
  return [...documents].sort((left, right) => right.updatedAt - left.updatedAt || left.id.localeCompare(right.id));
}

function publish(
  projectId: string,
  documents: readonly SketchDocument[],
  error: string | null = snapshot.error,
): void {
  setSnapshot({
    projectId,
    ready: true,
    documents: sortDocuments(documents),
    error,
  });
}

function messageForError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Sketch storage is unavailable. Your current sketch remains open; try again.";
}

function randomId(prefix: string): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch {
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function enqueue<T>(operation: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(operation, operation);
  writeQueue = next.then(() => undefined, () => undefined);
  return next;
}

function assertWritable(projectId: string, expectedGeneration: number): void {
  if (!canWriteWorkspace()) {
    throw new SketchStorageError("This inspector tab no longer owns the sketch workspace.");
  }
  if (activeProjectId !== projectId || generation !== expectedGeneration) {
    throw new SketchStorageError("This sketch workspace has changed; reload the inspector and try again.");
  }
}

function validateSaveInput(input: SaveSketchInput): void {
  const now = Date.now();
  if (!isSketchDocument({
    schemaVersion: SKETCH_SCHEMA_VERSION,
    projectId: "placeholder",
    id: "placeholder",
    createdAt: now,
    updatedAt: now,
    url: input.url,
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    image: input.image,
    ink: input.ink,
  })) {
    throw new SketchStorageError("The sketch exceeds one of the supported size or format limits.");
  }
}

export function getSketchStoreSnapshot(): SketchStoreSnapshot {
  return snapshot;
}

export function subscribeSketchStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSketchStore(): SketchStoreSnapshot {
  return useSyncExternalStore(subscribeSketchStore, getSketchStoreSnapshot, getSketchStoreSnapshot);
}

export function getSketches(): readonly SketchDocument[] {
  return snapshot.documents;
}

export function initializeSketchStore(projectId = getNudgeUiRuntimeConfig().projectId): Promise<void> {
  if (activeProjectId === projectId && initialization) return initialization;

  generation += 1;
  activeProjectId = projectId;
  setSnapshot({ ...EMPTY_SNAPSHOT, projectId });
  const expectedGeneration = generation;
  initialization = readSketchPersistence(projectId)
    .then((stored) => {
      if (activeProjectId !== projectId || generation !== expectedGeneration) return;
      const restored = stored.documents.filter((document) => isSketchDocument(document) && document.projectId === projectId);
      const validDocuments = sortDocuments(restored).slice(0, SKETCH_LIMITS.keptSketches);
      const invalidStoredData = restored.length !== stored.documents.length;
      publish(
        projectId,
        validDocuments,
        invalidStoredData ? "Some saved sketches could not be restored." : null,
      );
    })
    .catch((error: unknown) => {
      if (activeProjectId !== projectId || generation !== expectedGeneration) return;
      publish(projectId, [], messageForError(error));
      initialization = null;
      throw error;
    });
  return initialization;
}

export function saveSketch(input: SaveSketchInput): Promise<SketchDocument> {
  validateSaveInput(input);
  const projectId = activeProjectId ?? getNudgeUiRuntimeConfig().projectId;
  const expectedGeneration = generation;
  const hydration = initialization;

  return enqueue(async () => {
    if (hydration) await hydration;
    assertWritable(projectId, expectedGeneration);
    const now = Date.now();
    const document: SketchDocument = {
      schemaVersion: SKETCH_SCHEMA_VERSION,
      projectId,
      id: randomId("sketch"),
      createdAt: now,
      updatedAt: now,
      url: input.url,
      imageWidth: input.imageWidth,
      imageHeight: input.imageHeight,
      image: input.image,
      ...(input.ink ? { ink: input.ink } : {}),
    };
    // Only the most recent sketches are kept; saving another pushes the oldest out instead of failing.
    const others = sortDocuments(snapshot.documents);
    const nextDocuments = [document, ...others].slice(0, SKETCH_LIMITS.keptSketches);
    const evicted = others.filter((candidate) => !nextDocuments.includes(candidate));
    await writeSketchPersistence(projectId, document);
    // The new sketch is safely stored before the ones it replaces are deleted.
    for (const old of evicted) await deleteSketchPersistence(projectId, old.id);
    assertWritable(projectId, expectedGeneration);
    publish(projectId, nextDocuments, null);
    return document;
  });
}

export function removeSketch(sketchId: string): Promise<boolean> {
  if (!snapshot.documents.some((document) => document.id === sketchId)) return Promise.resolve(false);
  const projectId = activeProjectId;
  const expectedGeneration = generation;
  if (!projectId) return Promise.resolve(false);
  return enqueue(async () => {
    assertWritable(projectId, expectedGeneration);
    await deleteSketchPersistence(projectId, sketchId);
    assertWritable(projectId, expectedGeneration);
    publish(
      projectId,
      snapshot.documents.filter((document) => document.id !== sketchId),
      null,
    );
    return true;
  });
}

export function clearSketchesForProject(projectId = activeProjectId ?? getNudgeUiRuntimeConfig().projectId): Promise<void> {
  if (activeProjectId === projectId) {
    generation += 1;
    const expectedGeneration = generation;
    publish(projectId, [], null);
    return enqueue(async () => {
      if (!canWriteWorkspace()) throw new SketchStorageError("This inspector tab no longer owns the sketch workspace.");
      await clearSketchPersistence(projectId);
      if (activeProjectId !== projectId || generation !== expectedGeneration) return;
    }).catch((error: unknown) => {
      if (activeProjectId === projectId && generation === expectedGeneration) {
        setSnapshot({ ...snapshot, error: messageForError(error) });
      }
      throw error;
    });
  }
  return enqueue(() => clearSketchPersistence(projectId));
}

export function resetSketchStore(): void {
  generation += 1;
  activeProjectId = null;
  initialization = null;
  snapshot = EMPTY_SNAPSHOT;
  writeQueue = Promise.resolve();
  notify();
}
