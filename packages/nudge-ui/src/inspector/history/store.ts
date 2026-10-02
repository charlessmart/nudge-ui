import { getCanvasCards, selectCard, focusCanvasCards, setCanvasHistoryActivator } from "../canvas/canvasStore.ts";
import { useSyncExternalStore } from "react";
import { deserializeChange, serializeChange, type SerializableChange } from "../changes/codecs.ts";
import type { WorkspaceContents } from "../changes/workspaceChanges.ts";
import { workspaceChangeStore, getWorkspaceChanges, subscribeWorkspaceChanges, setWorkspaceHistoryContext, clearSessionUndoHistory, discardWorkspaceHistory } from "../changes/workspaceChanges.ts";
import { loadWorkspaceChanges } from "../changes/changesLog.ts";
import type { StructuralChange } from "../changes/structuralTypes.ts";
import { getSketchStoreSnapshot, subscribeSketchStore } from "../sketch/store.ts";
import type { DraftContents, HistoryDraft, HistoryFrameContent, HistorySnapshot } from "./model.ts";

interface PersistedHistory extends HistorySnapshot {
  readonly cardDrafts: Readonly<Record<string, string>>;
  readonly frameContents: Readonly<Record<string, HistoryFrameContent>>;
  readonly sketchDrafts: Readonly<Record<string, string>>;
  readonly draftForks?: Readonly<Record<string, string>>;
}

const EMPTY: HistorySnapshot = {
  schemaVersion: 1,
  projectId: "",
  drafts: [],
};

let snapshot: HistorySnapshot = EMPTY;
let cardDrafts = new Map<string, string>();
let frameContents = new Map<string, HistoryFrameContent>();
let sketchDrafts = new Map<string, string>();
/** Fork ancestry: forked draft -> source draft. Sketches owned by an ancestor
 * remain visible in the fork until the fork creates its own sketches. */
let draftForks = new Map<string, string>();
let activeDraftId: string | null = null;
let restoring = false;
let initialized = false;
const listeners = new Set<() => void>();

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
        };
        cardDrafts = new Map(Object.entries(value.cardDrafts ?? {}));
        frameContents = new Map(
          Object.entries(value.frameContents ?? {}).filter((entry) =>
            (entry[1] as { readonly kind?: unknown } | null)?.kind === "live",
          ) as Array<[string, HistoryFrameContent]>,
        );
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

export function forkDraftForCard(sourceCardId: string, targetCardId: string, captureAlreadyIncludesEdits = false): HistoryDraft | null {
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
    ...(captureAlreadyIncludesEdits ? { revision: 2 } : {}),
    createdAt: now,
    updatedAt: now,
    ...(captureAlreadyIncludesEdits ? {
      contents: { changes: [], structuralChanges: [], sketches: [], notes: "" },
    } : {}),
  };
  snapshot = { ...snapshot, drafts: [...snapshot.drafts, fork] };
  cardDrafts.set(targetCardId, fork.id);
  frameContents.set(targetCardId, { kind: "live", draftId: fork.id });
  draftForks.set(fork.id, source.id);
  persist();
  notify();
  return fork;
}

/** A live duplicate shares the source's edits until the user unlinks it. */
export function linkLiveCard(sourceCardId: string, targetCardId: string): void {
  const draftId = cardDrafts.get(sourceCardId);
  if (!draftId) return;
  cardDrafts.set(targetCardId, draftId);
  frameContents.set(targetCardId, { kind: "live", draftId });
  persist();
  notify();
}

export function activateDraftForCard(cardId: string): void {
  const content = frameContents.get(cardId);
  if (!content || content.kind !== "live") return;
  setWorkspaceHistoryContext(content.draftId, () => {
    const target = getCanvasCards().find((card) => card.id === cardId)
      ?? getCanvasCards().find((card) => cardDrafts.get(card.id) === content.draftId);
    if (!target) return;
    activateDraftForCard(target.id);
    selectCard(target.id);
    focusCanvasCards([target.id]);
  });
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
    loadWorkspaceChanges(workspace.changes, workspace.structuralChanges, true);
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

/** The committed HTML now includes these edits; start the next round empty. */
export function clearCommittedArtifactDraft(cardId: string): void {
  syncActiveDraft();
  const draftId = cardDrafts.get(cardId);
  const draft = snapshot.drafts.find((candidate) => candidate.id === draftId);
  if (!draft) return;
  discardWorkspaceHistory(draft.id);
  replaceDraft({
    ...draft,
    revision: draft.revision + 1,
    updatedAt: Date.now(),
    contents: { ...draft.contents, changes: [], structuralChanges: [] },
  });
  if (activeDraftId === draftId) {
    restoring = true;
    try {
      workspaceChangeStore.clearWorkspaceChanges();
      loadWorkspaceChanges([], [], true);
    }
    finally { restoring = false; }
  }
  persist();
  notify();
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

/** Drops per-card associations when a canvas card is removed. Drafts are
 * append-only and are never deleted here; sketches stay owned by their draft
 * so the draft keeps working with the sketches it captured. */
export function removeCardHistory(cardId: string): void {
  if (!cardDrafts.has(cardId) && !frameContents.has(cardId)) return;
  const draftId = cardDrafts.get(cardId);
  cardDrafts.delete(cardId);
  frameContents.delete(cardId);
  if (draftId && ![...cardDrafts.values()].includes(draftId)) discardWorkspaceHistory(draftId);
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

export function clearVersionHistory(): void {
  const projectId = snapshot.projectId;
  if (projectId) {
    try { localStorage.removeItem(storageKey(projectId)); } catch { /* ignore */ }
  }
  resetVersionHistory();
}

export function resetVersionHistory(): void {
  clearSessionUndoHistory();
  setWorkspaceHistoryContext("workspace");
  snapshot = EMPTY;
  cardDrafts.clear();
  frameContents.clear();
  sketchDrafts.clear();
  draftForks.clear();
  activeDraftId = null;
  initialized = false;
  notify();
}
setCanvasHistoryActivator(activateDraftForCard);
