import { useSyncExternalStore } from "react";
import { canWriteWorkspace } from "../canvas/workspaceLease.ts";
import { getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import {
  clearSketchPersistence,
  deleteSketchPersistence,
  readSketchPersistence,
  SketchStorageError,
  writeSketchHandoffs,
  writeSketchPersistence,
} from "./persistence.ts";
import {
  SKETCH_LIMITS,
  SKETCH_SCHEMA_VERSION,
  createSketchFilename,
  isSketchDocument,
  isSketchHandoffRecord,
  sameSketchContent,
  toAgentSketchMetadata,
  type SketchCaptureMetadata,
  type SketchAnnotation,
  type SketchDocument,
  type SketchHandoffRecord,
  type SketchQueueItem,
  type SketchStatus,
  type SketchStroke,
  type SketchTransport,
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
    // Fall through to the deterministic-enough browser fallback.
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

function updateHandoff(
  handoff: SketchHandoffRecord,
  patch: {
    readonly state: SketchStatus;
    readonly transport?: SketchTransport;
    readonly localBatchId?: string;
    readonly batchRevision?: number;
    readonly agentRequestId?: string;
    readonly clearDelivery?: boolean;
  },
): SketchHandoffRecord {
  type MutableHandoffRecord = { -readonly [key in keyof SketchHandoffRecord]: SketchHandoffRecord[key] };
  const next = {
    ...handoff,
    state: patch.state,
    timestamp: Date.now(),
    ...(patch.transport === undefined ? {} : { transport: patch.transport }),
    ...(patch.localBatchId === undefined ? {} : { localBatchId: patch.localBatchId }),
  } as MutableHandoffRecord;
  if (patch.clearDelivery) {
    delete next.batchRevision;
    delete next.agentRequestId;
  }
  if (patch.batchRevision !== undefined) next.batchRevision = patch.batchRevision;
  if (patch.agentRequestId !== undefined) next.agentRequestId = patch.agentRequestId;
  return next;
}

function matchingCurrentHandoffs(
  entries: readonly { readonly id: string; readonly revision: number }[],
): SketchHandoffRecord[] {
  const expected = new Map(entries.map((entry) => [entry.id, entry.revision]));
  return snapshot.handoffs.filter((handoff) => expected.get(handoff.sketchId) === handoff.sketchRevision
    && currentDocument(handoff.sketchId)?.revision === handoff.sketchRevision);
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

export function useSketches(): readonly SketchQueueItem[] {
  return useSketchStore().items;
}

export function getSketches(): readonly SketchQueueItem[] {
  return snapshot.items;
}

export function getPendingSketches(): readonly SketchQueueItem[] {
  return snapshot.items.filter((item) => item.status === "pending");
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
    const nextDocuments = documents.filter((candidate) => candidate.id !== document.id);
    nextDocuments.push(document);
    if (nextDocuments.length > SKETCH_LIMITS.completedSketches) {
      throw new SketchStorageError(`You can keep up to ${SKETCH_LIMITS.completedSketches} sketches at a time.`);
    }
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
    assertWritable(projectId, expectedGeneration);
    const nextHandoffs = snapshot.handoffs.filter((candidate) => candidate.sketchId !== document.id
      || candidate.sketchRevision !== document.revision);
    nextHandoffs.push(handoff);
    publish(projectId, nextDocuments, nextHandoffs, null);
    return document;
  });
}

export function markSketchesDispatching(
  entries: readonly { readonly id: string; readonly revision: number }[],
  batchRevision: number,
  localBatchId: string,
): Promise<boolean> {
  return updateMatchingHandoffs(entries, (handoff) => updateHandoff(handoff, {
    state: "dispatching",
    transport: "direct",
    batchRevision,
    localBatchId,
    clearDelivery: true,
  }));
}

export function markSketchesHandingOff(
  entries: readonly { readonly id: string; readonly revision: number }[],
  batchRevision: number,
  localBatchId: string,
  agentRequestId?: string,
): Promise<boolean> {
  const matching = matchingCurrentHandoffs(entries)
    .filter((handoff) => handoff.state === "dispatching" || handoff.state === "handing-off");
  return updateHandoffs(matching, (handoff) => updateHandoff(handoff, {
    state: "handing-off",
    transport: "direct",
    batchRevision,
    localBatchId,
    ...(agentRequestId ? { agentRequestId } : {}),
  }));
}

export function settleSketchDispatch(
  batchRevision: number | undefined,
  state: "working" | "completed" | "failed" | "interrupted",
  agentRequestId?: string,
  localBatchId?: string,
): Promise<boolean> {
  if (batchRevision === undefined) return Promise.resolve(false);
  const changes = snapshot.handoffs
    .filter((handoff) => handoff.batchRevision === batchRevision
      && (localBatchId === undefined || handoff.localBatchId === localBatchId)
      && (handoff.state === "dispatching" || handoff.state === "handing-off"));
  if (changes.length === 0) return Promise.resolve(false);
  return updateHandoffs(changes, (handoff) => {
    if (state === "working") {
      return updateHandoff(handoff, {
        state: "handing-off",
        transport: "direct",
        ...(agentRequestId ? { agentRequestId } : {}),
      });
    }
    if (state === "completed") {
      return updateHandoff(handoff, {
        state: "needs-review",
        transport: "direct",
        ...(agentRequestId ? { agentRequestId } : {}),
      });
    }
    return updateHandoff(handoff, {
      state: "pending",
      transport: "direct",
      clearDelivery: true,
    });
  });
}

export function markSketchesHandedOff(
  entries: readonly { readonly id: string; readonly revision: number }[],
  localBatchId?: string,
): Promise<boolean> {
  return updateMatchingHandoffs(entries, (handoff) => updateHandoff(handoff, {
    state: "needs-review",
    transport: "clipboard",
    ...(localBatchId ? { localBatchId } : {}),
  }));
}

export function requeueSketch(sketchId: string): Promise<boolean> {
  const item = getSketch(sketchId);
  if (!item) return Promise.resolve(false);
  return updateMatchingHandoffs([{ id: sketchId, revision: item.document.revision }], (handoff) => updateHandoff(handoff, {
    state: "pending",
    transport: "local",
    clearDelivery: true,
    localBatchId: randomId("batch"),
  }));
}

export function removeSketch(sketchId: string): Promise<boolean> {
  const item = getSketch(sketchId);
  if (!item || item.status === "dispatching" || item.status === "handing-off") return Promise.resolve(false);
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

function updateMatchingHandoffs(
  entries: readonly { readonly id: string; readonly revision: number }[],
  update: (handoff: SketchHandoffRecord) => SketchHandoffRecord,
): Promise<boolean> {
  const matching = matchingCurrentHandoffs(entries);
  if (matching.length === 0) return Promise.resolve(false);
  return updateHandoffs(matching, update);
}

function updateHandoffs(
  handoffs: readonly SketchHandoffRecord[],
  update: (handoff: SketchHandoffRecord) => SketchHandoffRecord,
): Promise<boolean> {
  const projectId = activeProjectId;
  const expectedGeneration = generation;
  if (!projectId) return Promise.resolve(false);
  const nextHandoffs = handoffs.map(update);
  return enqueue(async () => {
    assertWritable(projectId, expectedGeneration);
    await writeSketchHandoffs(projectId, nextHandoffs);
    assertWritable(projectId, expectedGeneration);
    const changedIds = new Set(nextHandoffs.map((handoff) => handoff.id));
    publish(
      projectId,
      snapshot.documents,
      [...snapshot.handoffs.filter((handoff) => !changedIds.has(handoff.id)), ...nextHandoffs],
      null,
    );
    return true;
  });
}

export function sketchMetadataFor(items: readonly SketchQueueItem[]): ReturnType<typeof toAgentSketchMetadata>[] {
  return items.map((item) => toAgentSketchMetadata(item.document));
}

export function resetSketchStore(): void {
  generation += 1;
  activeProjectId = null;
  initialization = null;
  snapshot = EMPTY_SNAPSHOT;
  writeQueue = Promise.resolve();
  notify();
}
