import { useSyncExternalStore } from "react";
import { canWriteWorkspace } from "../canvas/workspaceLease.ts";
import { getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
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
  createSketchFilename,
  isSketchDocument,
  isSketchHandoffRecord,
  sameSketchContent,
  type SketchCaptureMetadata,
  type SketchAnnotation,
  type SketchDocument,
  type SketchHandoffRecord,
  type SketchQueueItem,
  type SketchStroke,
} from "./model.ts";

export interface SaveSketchInput {
  readonly id?: string;
  readonly capture: SketchCaptureMetadata;
  readonly description: string;
  readonly strokes: readonly SketchStroke[];
  readonly annotations?: readonly SketchAnnotation[];
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly originalImage: Blob;
  readonly annotatedImage: Blob;
}

export interface SketchStoreSnapshot {
  readonly projectId: string | null;
  readonly ready: boolean;
  readonly documents: readonly SketchDocument[];
  readonly handoffs: readonly SketchHandoffRecord[];
  readonly items: readonly SketchQueueItem[];
  readonly error: string | null;
}

const EMPTY_SNAPSHOT: SketchStoreSnapshot = {
  projectId: null,
  ready: false,
  documents: [],
  handoffs: [],
  items: [],
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

function sortHandoffs(handoffs: readonly SketchHandoffRecord[]): SketchHandoffRecord[] {
  return [...handoffs].sort((left, right) => right.timestamp - left.timestamp || left.id.localeCompare(right.id));
}

function currentHandoff(
  document: Pick<SketchDocument, "id" | "revision">,
  handoffs: readonly SketchHandoffRecord[],
): SketchHandoffRecord | null {
  return handoffs
    .filter((handoff) => handoff.sketchId === document.id && handoff.sketchRevision === document.revision)
    .sort((left, right) => right.timestamp - left.timestamp || right.id.localeCompare(left.id))[0] ?? null;
}

function deriveItems(
  documents: readonly SketchDocument[],
  handoffs: readonly SketchHandoffRecord[],
): SketchQueueItem[] {
  return sortDocuments(documents).map((document) => {
    const handoff = currentHandoff(document, handoffs);
    return {
      document,
      handoff,
      status: handoff?.state ?? "pending",
    };
  });
}

function publish(
  projectId: string,
  documents: readonly SketchDocument[],
  handoffs: readonly SketchHandoffRecord[],
  error: string | null = snapshot.error,
): void {
  setSnapshot({
    projectId,
    ready: true,
    documents: sortDocuments(documents),
    handoffs: sortHandoffs(handoffs),
    items: deriveItems(documents, handoffs),
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
  if (input.id !== undefined && (input.id.length === 0 || input.id.length > 256)) {
    throw new SketchStorageError("The sketch identifier is invalid.");
  }
  if (!isSketchDocument({
    schemaVersion: SKETCH_SCHEMA_VERSION,
    projectId: "placeholder",
    id: input.id ?? "placeholder",
    revision: 1,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    capture: input.capture,
    description: input.description,
    strokes: input.strokes,
    annotations: input.annotations ?? [],
    imageWidth: input.imageWidth,
    imageHeight: input.imageHeight,
    originalByteSize: input.originalImage.size,
    annotatedByteSize: input.annotatedImage.size,
    filename: "sketch.png",
    originalImage: input.originalImage,
    annotatedImage: input.annotatedImage,
  })) {
    throw new SketchStorageError("The sketch exceeds one of the supported size or format limits.");
  }
  if (input.originalImage.type !== "image/png" || input.annotatedImage.type !== "image/png") {
    throw new SketchStorageError("Sketch images must be PNG files.");
  }
}

function projectBytes(documents: readonly SketchDocument[]): number {
  return documents.reduce((total, document) => total + document.originalByteSize + document.annotatedByteSize, 0);
}

function currentDocument(sketchId: string): SketchDocument | null {
  return snapshot.documents.find((document) => document.id === sketchId) ?? null;
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

export function getSketches(): readonly SketchQueueItem[] {
  return snapshot.items;
}

export function getSketch(sketchId: string): SketchQueueItem | null {
  return snapshot.items.find((item) => item.document.id === sketchId) ?? null;
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
      const validDocuments = stored.documents.filter((document) => isSketchDocument(document) && document.projectId === projectId);
      const validDocumentIds = new Set(validDocuments.map((document) => document.id));
      const validHandoffs = stored.handoffs
        .filter((handoff) => isSketchHandoffRecord(handoff)
          && handoff.projectId === projectId && validDocumentIds.has(handoff.sketchId))
        .map((handoff) => handoff.state === "dispatching" || handoff.state === "handing-off"
          ? { ...handoff, state: "unknown" as const, timestamp: Date.now() }
          : handoff);
      const invalidStoredData = validDocuments.length !== stored.documents.length
        || validHandoffs.length !== stored.handoffs.length;
      publish(
        projectId,
        validDocuments,
        validHandoffs,
        invalidStoredData ? "Some saved sketches could not be restored." : null,
      );
    })
    .catch((error: unknown) => {
      if (activeProjectId !== projectId || generation !== expectedGeneration) return;
      publish(projectId, [], [], messageForError(error));
      initialization = null;
      throw error;
    });
  return initialization;
}

export function saveSketch(input: SaveSketchInput): Promise<SketchDocument> {
  validateSaveInput(input);
  const projectId = activeProjectId ?? getNudgeUiRuntimeConfig().projectId;
  const expectedGeneration = generation;
  const existing = input.id ? currentDocument(input.id) : null;
  if (existing && sameSketchContent(existing, input.description, input.strokes, input.annotations ?? [])) {
    return Promise.resolve(existing);
  }
  const hydration = initialization;

  return enqueue(async () => {
    if (hydration) await hydration;
    assertWritable(projectId, expectedGeneration);
    const documents = [...snapshot.documents];
    const current = input.id ? documents.find((document) => document.id === input.id) : undefined;
    const now = Date.now();
    const id = current?.id ?? input.id ?? randomId("sketch");
    const revision = (current?.revision ?? 0) + 1;
    const document: SketchDocument = {
      schemaVersion: SKETCH_SCHEMA_VERSION,
      projectId,
      id,
      revision,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
      capture: { ...input.capture },
      description: input.description,
      strokes: input.strokes.map((stroke) => ({ ...stroke, points: stroke.points.map((point) => ({ ...point })) })),
      annotations: (input.annotations ?? []).map((annotation) => ({
        ...annotation,
        point: { ...annotation.point },
      })),
      imageWidth: input.imageWidth,
      imageHeight: input.imageHeight,
      originalByteSize: input.originalImage.size,
      annotatedByteSize: input.annotatedImage.size,
      filename: createSketchFilename(id, revision),
      originalImage: input.originalImage,
      annotatedImage: input.annotatedImage,
    };
    // Only the most recent sketches are kept; saving another pushes the oldest out instead of failing. The one being saved is the latest by definition, whatever the clock says, so it always stays.
    const others = sortDocuments(documents.filter((candidate) => candidate.id !== document.id));
    const nextDocuments = [document, ...others].slice(0, SKETCH_LIMITS.keptSketches);
    const evicted = others.filter((candidate) => !nextDocuments.includes(candidate));
    if (projectBytes(nextDocuments) > SKETCH_LIMITS.projectBytes) {
      throw new SketchStorageError("The saved sketches use more than the project storage limit.");
    }
    const handoff: SketchHandoffRecord = {
      id: randomId("handoff"),
      projectId,
      sketchId: document.id,
      sketchRevision: document.revision,
      localBatchId: randomId("batch"),
      transport: "local",
      timestamp: now,
      state: "pending",
    };
    await writeSketchPersistence(projectId, document, handoff);
    // The new sketch is safely stored before the ones it replaces are deleted.
    for (const old of evicted) await deleteSketchPersistence(projectId, old.id);
    assertWritable(projectId, expectedGeneration);
    const evictedIds = new Set(evicted.map((old) => old.id));
    const nextHandoffs = snapshot.handoffs.filter((candidate) => !evictedIds.has(candidate.sketchId)
      && (candidate.sketchId !== document.id || candidate.sketchRevision !== document.revision));
    nextHandoffs.push(handoff);
    publish(projectId, nextDocuments, nextHandoffs, null);
    return document;
  });
}

export function removeSketch(sketchId: string): Promise<boolean> {
  if (!getSketch(sketchId)) return Promise.resolve(false);
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
      snapshot.handoffs.filter((handoff) => handoff.sketchId !== sketchId),
      null,
    );
    return true;
  });
}

export function clearSketchesForProject(projectId = activeProjectId ?? getNudgeUiRuntimeConfig().projectId): Promise<void> {
  if (activeProjectId === projectId) {
    generation += 1;
    const expectedGeneration = generation;
    publish(projectId, [], [], null);
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
