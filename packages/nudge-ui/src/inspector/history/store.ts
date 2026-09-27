import { useSyncExternalStore } from "react";
import { deserializeChange, serializeChange, type SerializableChange } from "../changes/codecs.ts";
import type { WorkspaceContents } from "../changes/workspaceChanges.ts";
import { getWorkspaceChanges, subscribeWorkspaceChanges } from "../changes/workspaceChanges.ts";
import { loadWorkspaceChanges } from "../changes/changesLog.ts";
import type { StructuralChange } from "../changes/structuralTypes.ts";
import { addCanvasCard, selectCard, setCanvasPresentation } from "../canvas/canvasStore.ts";
import { captureViewport } from "../sketch/capture.ts";
import { getPendingSketches, getSketchStoreSnapshot, subscribeSketchStore } from "../sketch/store.ts";
import type {
  CheckpointOrigin,
  CheckpointView,
  DraftContents,
  HistoryCheckpoint,
  HistoryDraft,
  HistoryFrameContent,
  HistoryHandoff,
  HistoryImage,
  HistorySketch,
  HistorySnapshot,
} from "./model.ts";
import type { CheckpointRequest, HistoryResult } from "./contracts.ts";

interface PersistedHistory extends HistorySnapshot {
  readonly cardDrafts: Readonly<Record<string, string>>;
  readonly frameContents: Readonly<Record<string, HistoryFrameContent>>;
  readonly duplicateSources: Readonly<Record<string, string>>;
  readonly sketchDrafts: Readonly<Record<string, string>>;
  readonly draftForks?: Readonly<Record<string, string>>;
}

const EMPTY: HistorySnapshot = {
  schemaVersion: 1,
  projectId: "",
  drafts: [],
  checkpoints: [],
  handoffs: [],
};
const DATABASE_NAME = "nudge-ui-history";
const DATABASE_VERSION = 1;
const IMAGE_STORE = "images";

let snapshot: HistorySnapshot = EMPTY;
let cardDrafts = new Map<string, string>();
let frameContents = new Map<string, HistoryFrameContent>();
let duplicateSources = new Map<string, string>();
let sketchDrafts = new Map<string, string>();
/** Fork ancestry: forked draft -> source draft. Sketches owned by an ancestor
 * remain visible in the fork until the fork creates its own sketches. */
let draftForks = new Map<string, string>();
let activeDraftId: string | null = null;
let restoring = false;
let initialized = false;
const listeners = new Set<() => void>();
const memoryImages = new Map<string, Blob>();
let databasePromise: Promise<IDBDatabase | null> | null = null;

/** Frame lookup registered by the canvas owner. Avoids a static import cycle
 * with canvas projection, which must stay importable in Node unit tests. */
let frameLookup: (() => ReadonlyMap<string, HTMLIFrameElement>) | null = null;

export function registerHistoryFrameLookup(
  lookup: (() => ReadonlyMap<string, HTMLIFrameElement>) | null,
): void {
  frameLookup = lookup;
}

function getFrames(): ReadonlyMap<string, HTMLIFrameElement> {
  return frameLookup?.() ?? new Map();
}

function id(prefix: string): string {
  try {
    return `${prefix}-${crypto.randomUUID()}`;
  } catch {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  }
}

function notify(): void {
  for (const listener of listeners) listener();
}

function storageKey(projectId: string): string {
  return `nudge-ui-history:${projectId}:v1`;
}

function persist(): void {
  if (!initialized || !snapshot.projectId) return;
  const value: PersistedHistory = {
    ...snapshot,
    cardDrafts: Object.fromEntries(cardDrafts),
    frameContents: Object.fromEntries(frameContents),
    duplicateSources: Object.fromEntries(duplicateSources),
    sketchDrafts: Object.fromEntries(sketchDrafts),
    draftForks: Object.fromEntries(draftForks),
  };
  try {
    localStorage.setItem(storageKey(snapshot.projectId), JSON.stringify(value));
  } catch {
    // The live draft remains usable when durable browser storage is unavailable.
  }
}

function serializableWorkspace(workspace: WorkspaceContents): Pick<DraftContents, "changes" | "structuralChanges"> {
  const changes: SerializableChange[] = [];
  for (const change of workspace.changes) {
    const value = serializeChange(change);
    if (value) changes.push(value);
  }
  return {
    changes,
    structuralChanges: structuredClone(workspace.structuralChanges) as StructuralChange[],
  };
}

function emptyContents(workspace: WorkspaceContents = getWorkspaceChanges()): DraftContents {
  const serialized = serializableWorkspace(workspace);
  return { ...serialized, sketches: [], notes: "" };
}

function workspaceFromDraft(draft: HistoryDraft): WorkspaceContents {
  return {
    changes: draft.contents.changes.map((change) => deserializeChange(change as SerializableChange)),
    structuralChanges: structuredClone(draft.contents.structuralChanges) as StructuralChange[],
  };
}

function replaceDraft(next: HistoryDraft): void {
  snapshot = {
    ...snapshot,
    drafts: snapshot.drafts.map((draft) => draft.id === next.id ? next : draft),
  };
}

function syncActiveDraft(): void {
  if (restoring || !initialized || !activeDraftId) return;
  const current = snapshot.drafts.find((draft) => draft.id === activeDraftId);
  if (!current) return;
  const serialized = serializableWorkspace(getWorkspaceChanges());
  if (JSON.stringify(current.contents.changes) === JSON.stringify(serialized.changes)
    && JSON.stringify(current.contents.structuralChanges) === JSON.stringify(serialized.structuralChanges)) {
    return;
  }
  const next: HistoryDraft = {
    ...current,
    revision: current.revision + 1,
    updatedAt: Date.now(),
    contents: { ...current.contents, ...serialized },
  };
  replaceDraft(next);
  persist();
  notify();
}

subscribeWorkspaceChanges(syncActiveDraft);

function assignUnownedSketches(): void {
  if (!initialized || !activeDraftId) return;
  let changed = false;
  for (const item of getSketchStoreSnapshot().items) {
    if (sketchDrafts.has(item.document.id)) continue;
    sketchDrafts.set(item.document.id, activeDraftId);
    changed = true;
  }
  if (changed) {
    persist();
    notify();
  }
}

subscribeSketchStore(assignUnownedSketches);

export function initializeVersionHistory(projectId: string, cardIds: readonly string[]): void {
  if (initialized && snapshot.projectId === projectId) {
    ensureCards(cardIds);
    return;
  }
  snapshot = { ...EMPTY, projectId };
  cardDrafts = new Map();
  frameContents = new Map();
  duplicateSources = new Map();
  sketchDrafts = new Map();
  draftForks = new Map();
  activeDraftId = null;
  try {
    const raw = localStorage.getItem(storageKey(projectId));
    if (raw) {
      const value = JSON.parse(raw) as Partial<PersistedHistory>;
      if (value.schemaVersion === 1 && value.projectId === projectId) {
        snapshot = {
          schemaVersion: 1,
          projectId,
          drafts: Array.isArray(value.drafts) ? value.drafts : [],
          checkpoints: Array.isArray(value.checkpoints) ? value.checkpoints : [],
          handoffs: Array.isArray(value.handoffs) ? value.handoffs : [],
        };
        cardDrafts = new Map(Object.entries(value.cardDrafts ?? {}));
        frameContents = new Map(Object.entries(value.frameContents ?? {}) as Array<[string, HistoryFrameContent]>);
        duplicateSources = new Map(Object.entries(value.duplicateSources ?? {}));
        sketchDrafts = new Map(Object.entries(value.sketchDrafts ?? {}));
        draftForks = new Map(Object.entries(value.draftForks ?? {}));
      }
    }
  } catch {
    // Start a fresh history if persisted metadata is malformed.
  }
  initialized = true;
  ensureCards(cardIds);
  notify();
}

function ensureCards(cardIds: readonly string[]): void {
  if (!initialized || cardIds.length === 0) return;
  let shared = snapshot.drafts[0];
  if (!shared) {
    const now = Date.now();
    shared = {
      id: id("draft"),
      projectId: snapshot.projectId,
      label: "Current design",
      revision: 1,
      createdAt: now,
      updatedAt: now,
      baseCheckpointId: null,
      contents: emptyContents(),
    };
    snapshot = { ...snapshot, drafts: [shared] };
  }
  for (const cardId of cardIds) {
    if (!cardDrafts.has(cardId)) cardDrafts.set(cardId, shared.id);
    if (!frameContents.has(cardId)) frameContents.set(cardId, { kind: "live", draftId: cardDrafts.get(cardId)! });
  }
  persist();
}

export function forkDraftForCard(sourceCardId: string, targetCardId: string): HistoryDraft | null {
  syncActiveDraft();
  const sourceId = cardDrafts.get(sourceCardId);
  const source = snapshot.drafts.find((draft) => draft.id === sourceId);
  if (!source) return null;
  const now = Date.now();
  const fork: HistoryDraft = {
    ...structuredClone(source),
    id: id("draft"),
    label: `${source.label} copy`,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  snapshot = { ...snapshot, drafts: [...snapshot.drafts, fork] };
  cardDrafts.set(targetCardId, fork.id);
  frameContents.set(targetCardId, { kind: "live", draftId: fork.id });
  duplicateSources.set(targetCardId, sourceCardId);
  draftForks.set(fork.id, source.id);
  persist();
  notify();
  return fork;
}

export function activateDraftForCard(cardId: string): void {
  const content = frameContents.get(cardId);
  if (!content || content.kind !== "live") return;
  if (activeDraftId === content.draftId) return;
  syncActiveDraft();
  const draft = snapshot.drafts.find((candidate) => candidate.id === content.draftId);
  if (!draft) return;
  // First activation after a session restore must not discard restored edits.
  // If the stored draft is pristine but the live workspace already holds
  // intent, adopt the live workspace into the draft instead of overwriting it.
  if (activeDraftId === null && draft.revision <= 1) {
    const live = serializableWorkspace(getWorkspaceChanges());
    const empty = draft.contents.changes.length === 0
      && draft.contents.structuralChanges.length === 0;
    if (empty && (live.changes.length > 0 || live.structuralChanges.length > 0)) {
      const adopted: HistoryDraft = {
        ...draft,
        revision: draft.revision + 1,
        updatedAt: Date.now(),
        contents: { ...draft.contents, ...live },
      };
      replaceDraft(adopted);
      activeDraftId = adopted.id;
      persist();
      assignUnownedSketches();
      notify();
      return;
    }
  }
  activeDraftId = draft.id;
  restoring = true;
  try {
    const workspace = workspaceFromDraft(draft);
    loadWorkspaceChanges(workspace.changes, workspace.structuralChanges);
  } finally {
    restoring = false;
  }
  assignUnownedSketches();
  notify();
}

export function getWorkspaceForCard(cardId: string): WorkspaceContents | null {
  const draftId = cardDrafts.get(cardId);
  if (!draftId) return null;
  // The active draft's live workspace is authoritative; the stored snapshot
  // lags by one notification cycle. Inactive drafts use their stored intent.
  if (draftId === activeDraftId) {
    const live = getWorkspaceChanges();
    return { changes: [...live.changes], structuralChanges: [...live.structuralChanges] };
  }
  const draft = snapshot.drafts.find((candidate) => candidate.id === draftId);
  return draft ? workspaceFromDraft(draft) : null;
}

export function getDraftRevisionForCard(cardId: string): { draftId: string; revision: number } | null {
  syncActiveDraft();
  const draftId = cardDrafts.get(cardId);
  const draft = snapshot.drafts.find((candidate) => candidate.id === draftId);
  return draft ? { draftId: draft.id, revision: draft.revision } : null;
}

export function getFrameContent(cardId: string): HistoryFrameContent | null {
  return frameContents.get(cardId) ?? null;
}

export function getLiveCardId(...preferredCardIds: readonly (string | null | undefined)[]): string | null {
  for (const cardId of preferredCardIds) {
    if (cardId && frameContents.get(cardId)?.kind === "live") return cardId;
  }
  for (const [cardId, content] of frameContents) {
    if (content.kind === "live") return cardId;
  }
  return null;
}

export function sketchBelongsToCard(sketchId: string, cardId: string | null): boolean {
  if (!initialized || !cardId) return true;
  const draftId = cardDrafts.get(cardId);
  const owner = sketchDrafts.get(sketchId);
  if (owner === undefined || owner === draftId) return true;
  // Sketches created before a duplicate remain visible in the fork. New
  // sketches after the fork are owned exclusively by the active draft.
  let current = draftId;
  while (current) {
    if (current === owner) return true;
    current = draftForks.get(current);
  }
  return false;
}

export function getActiveDraftId(): string | null {
  return activeDraftId;
}

export function getDraftIdForCard(cardId: string): string | null {
  return cardDrafts.get(cardId) ?? null;
}

/** Drops per-card associations when a canvas card is removed. Drafts,
 * checkpoints, and handoffs are append-only and are never deleted here. */
export function removeCardHistory(cardId: string): void {
  if (!cardDrafts.has(cardId) && !frameContents.has(cardId) && !duplicateSources.has(cardId)) return;
  cardDrafts.delete(cardId);
  frameContents.delete(cardId);
  duplicateSources.delete(cardId);
  // Sketches stay owned by their draft so checkpoints keep their intent.
  persist();
  notify();
}

export function subscribeVersionHistory(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getVersionHistorySnapshot(): HistorySnapshot {
  return snapshot;
}

export function useVersionHistory(): HistorySnapshot {
  return useSyncExternalStore(
    subscribeVersionHistory,
    getVersionHistorySnapshot,
    getVersionHistorySnapshot,
  );
}

export function useFrameContent(cardId: string): HistoryFrameContent | null {
  return useSyncExternalStore(
    subscribeVersionHistory,
    () => getFrameContent(cardId),
    () => getFrameContent(cardId),
  );
}

async function openDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return null;
  if (!databasePromise) {
    databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(IMAGE_STORE)) request.result.createObjectStore(IMAGE_STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch(() => null);
  }
  return databasePromise;
}

async function putImage(blob: Blob, width: number, height: number): Promise<HistoryImage> {
  const image: HistoryImage = { id: id("image"), mimeType: "image/png", byteSize: blob.size, width, height };
  memoryImages.set(image.id, blob);
  const database = await openDatabase();
  if (database) {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(IMAGE_STORE, "readwrite");
      transaction.objectStore(IMAGE_STORE).put(blob, image.id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  }
  return image;
}

export async function readHistoryImage(imageId: string): Promise<Blob | null> {
  const memory = memoryImages.get(imageId);
  if (memory) return memory;
  const database = await openDatabase();
  if (!database) return null;
  return new Promise((resolve) => {
    const request = database.transaction(IMAGE_STORE, "readonly").objectStore(IMAGE_STORE).get(imageId);
    request.onsuccess = () => resolve(request.result instanceof Blob ? request.result : null);
    request.onerror = () => resolve(null);
  });
}

async function historySketches(draftId: string): Promise<HistorySketch[]> {
  // Include sketches owned by this draft or any ancestor it was forked from,
  // so a duplicate starts with the same visual intent. New sketches after the
  // fork are owned exclusively and stay independent.
  const visible = (owner: string | undefined): boolean => {
    if (owner === undefined || owner === draftId) return true;
    let current: string | undefined = draftId;
    while (current) {
      if (current === owner) return true;
      current = draftForks.get(current);
    }
    return false;
  };
  return Promise.all(getPendingSketches()
    .filter(({ document }) => visible(sketchDrafts.get(document.id)))
    .map(async ({ document }) => {
    const {
      originalImage: originalBlob,
      annotatedImage: annotatedBlob,
      originalByteSize: _originalByteSize,
      annotatedByteSize: _annotatedByteSize,
      ...metadata
    } = document;
    return {
      ...metadata,
      originalImage: await putImage(originalBlob, document.capture.imageWidth, document.capture.imageHeight),
      annotatedImage: await putImage(annotatedBlob, document.imageWidth, document.imageHeight),
    } as HistorySketch;
    }));
}

async function saveCheckpoint(input: CheckpointRequest): Promise<HistoryResult<HistoryCheckpoint>> {
  syncActiveDraft();
  const draft = snapshot.drafts.find((candidate) => candidate.id === input.draft.draftId);
  if (!draft) return { ok: false, code: "not-found", message: "The draft no longer exists." };
  if (draft.revision !== input.draft.revision) {
    return { ok: false, code: "revision-conflict", message: "The draft changed while its version was being saved." };
  }
  try {
    const views: CheckpointView[] = [];
    const frames = getFrames();
    for (const frameId of input.frameIds) {
      const iframe = frames.get(frameId);
      if (!iframe) return { ok: false, code: "capture-failed", message: "A preview was not ready to capture." };
      const captured = await captureViewport({ hostElement: iframe });
      const image = await putImage(captured.originalImage, captured.imageWidth, captured.imageHeight);
      views.push({
        id: id("view"),
        sourceFrameId: frameId,
        url: captured.capture.url,
        title: captured.capture.title,
        capturedAt: captured.capture.timestamp,
        viewport: { width: captured.capture.viewportWidth, height: captured.capture.viewportHeight },
        scroll: { x: captured.capture.scrollX, y: captured.capture.scrollY },
        devicePixelRatio: captured.capture.devicePixelRatio,
        image,
      });
    }
    if (views.length === 0) return { ok: false, code: "capture-failed", message: "No preview was available to capture." };
    const current = snapshot.drafts.find((candidate) => candidate.id === draft.id);
    if (!current || current.revision !== input.draft.revision) {
      return { ok: false, code: "revision-conflict", message: "The draft changed while its version was being saved." };
    }
    const checkpoint: HistoryCheckpoint = {
      id: id("checkpoint"),
      projectId: snapshot.projectId,
      label: input.label,
      createdAt: Date.now(),
      parentCheckpointId: draft.baseCheckpointId,
      draftId: draft.id,
      draftRevision: draft.revision,
      origin: input.origin,
      contents: { ...structuredClone(draft.contents), sketches: await historySketches(draft.id) },
      views: views as [CheckpointView, ...CheckpointView[]],
    };
    snapshot = { ...snapshot, checkpoints: [...snapshot.checkpoints, checkpoint] };
    persist();
    notify();
    return { ok: true, value: checkpoint };
  } catch (error) {
    return { ok: false, code: "storage-failed", message: error instanceof Error ? error.message : "The version could not be saved." };
  }
}

export async function saveManualCheckpoint(cardId: string): Promise<HistoryResult<HistoryCheckpoint>> {
  const revision = getDraftRevisionForCard(cardId);
  if (!revision) return { ok: false, code: "not-found", message: "The draft no longer exists." };
  return saveCheckpoint({
    draft: revision,
    label: "Saved version",
    origin: { kind: "manual" },
    frameIds: [cardId],
  });
}

export async function prepareHandoffHistory(input: {
  readonly activeCardId: string;
  readonly prompt: string;
  readonly transport: "clipboard" | "agent";
}): Promise<HistoryResult<HistoryHandoff>> {
  const proposalRevision = getDraftRevisionForCard(input.activeCardId);
  if (!proposalRevision) return { ok: false, code: "not-found", message: "The active draft no longer exists." };
  const proposal = await saveCheckpoint({
    draft: proposalRevision,
    label: "Proposed changes",
    origin: { kind: "proposal" },
    frameIds: [input.activeCardId],
  });
  if (!proposal.ok) return proposal;

  const comparisonCheckpointIds: string[] = [];
  const sourceCardId = duplicateSources.get(input.activeCardId);
  if (sourceCardId) {
    const sourceRevision = getDraftRevisionForCard(sourceCardId);
    if (sourceRevision) {
      const comparison = await saveCheckpoint({
        draft: sourceRevision,
        label: "Before",
        origin: { kind: "comparison" },
        frameIds: [sourceCardId],
      });
      if (comparison.ok) comparisonCheckpointIds.push(comparison.value.id);
    }
  }
  const handoff: HistoryHandoff = {
    id: id("handoff"),
    projectId: snapshot.projectId,
    createdAt: Date.now(),
    proposalCheckpointId: proposal.value.id,
    comparisonCheckpointIds,
    prompt: input.prompt,
    transport: input.transport,
    target: "shared-source",
    outcome: { kind: "prepared" },
  };
  snapshot = { ...snapshot, handoffs: [...snapshot.handoffs, handoff] };
  persist();
  notify();
  return { ok: true, value: handoff };
}

export function completeHandoffHistory(handoffId: string, agentRequestId?: string): void {
  const handoff = snapshot.handoffs.find((candidate) => candidate.id === handoffId);
  if (!handoff) return;
  snapshot = {
    ...snapshot,
    handoffs: snapshot.handoffs.map((candidate) => candidate.id === handoffId
      ? {
        ...candidate,
        outcome: agentRequestId
          ? { kind: "sent", at: Date.now(), agentRequestId }
          : { kind: "copied", at: Date.now() },
      }
      : candidate),
  };
  const comparisonId = handoff.comparisonCheckpointIds[0];
  const checkpoint = snapshot.checkpoints.find((candidate) => candidate.id === comparisonId);
  const view = checkpoint?.views[0];
  if (checkpoint && view) {
    const sourceCardId = view.sourceFrameId;
    frameContents.set(sourceCardId, { kind: "snapshot", checkpointId: checkpoint.id, viewId: view.id });
  }
  persist();
  notify();
}

export async function captureImplementationHistory(input: {
  readonly handoffId: string;
  readonly activeCardId: string;
  readonly verified: boolean;
}): Promise<HistoryResult<HistoryCheckpoint>> {
  const handoff = snapshot.handoffs.find((candidate) => candidate.id === input.handoffId);
  const revision = getDraftRevisionForCard(input.activeCardId);
  if (!handoff || !revision) {
    return { ok: false, code: "not-found", message: "The implemented version could not be associated with its proposal." };
  }
  const result = await saveCheckpoint({
    draft: revision,
    label: "Implemented result",
    origin: { kind: "implementation", handoffId: handoff.id },
    frameIds: [input.activeCardId],
  });
  if (!result.ok) return result;
  snapshot = {
    ...snapshot,
    handoffs: snapshot.handoffs.map((candidate) => candidate.id === handoff.id
      ? {
        ...candidate,
        outcome: input.verified
          ? {
            kind: "accepted",
            at: Date.now(),
            resultCheckpointId: result.value.id,
            confirmation: "verified",
          }
          : { kind: "review-needed", at: Date.now(), resultCheckpointId: result.value.id },
      }
      : candidate),
  };
  persist();
  notify();
  return result;
}

export function clearVersionHistory(): void {
  const projectId = snapshot.projectId;
  if (projectId) {
    try { localStorage.removeItem(storageKey(projectId)); } catch { /* ignore */ }
  }
  resetVersionHistory();
}

export function showLiveFrame(cardId: string): void {
  const draftId = cardDrafts.get(cardId);
  if (!draftId) return;
  frameContents.set(cardId, { kind: "live", draftId });
  persist();
  notify();
}

export function getCheckpointView(checkpointId: string, viewId: string): CheckpointView | null {
  return snapshot.checkpoints.find((checkpoint) => checkpoint.id === checkpointId)
    ?.views.find((view) => view.id === viewId) ?? null;
}

export function placeCheckpointOnCanvas(checkpointId: string): string | null {
  const checkpoint = snapshot.checkpoints.find((candidate) => candidate.id === checkpointId);
  const view = checkpoint?.views[0];
  if (!checkpoint || !view) return null;
  const card = addCanvasCard(view.url, checkpoint.label);
  frameContents.set(card.id, { kind: "snapshot", checkpointId, viewId: view.id });
  cardDrafts.set(card.id, checkpoint.draftId);
  selectCard(card.id);
  setCanvasPresentation("canvas");
  persist();
  notify();
  return card.id;
}

export function resetVersionHistory(): void {
  snapshot = EMPTY;
  cardDrafts.clear();
  frameContents.clear();
  duplicateSources.clear();
  sketchDrafts.clear();
  draftForks.clear();
  activeDraftId = null;
  initialized = false;
  memoryImages.clear();
  notify();
}
