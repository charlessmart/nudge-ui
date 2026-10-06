import { canWriteWorkspace } from "../canvas/workspaceLease.ts";
import { applicationTarget, targetKey } from "../drafts/model.ts";
import { changeKey, mergeChange, sameEffectiveChanges, selectorForChange } from "./model.ts";
import { isElementChange, type ChangeRecord } from "./types.ts";
import type { StructuralChange } from "./structuralTypes.ts";
import {
  recordEdit,
  replayTimeline,
  pruneDraftHistory,
  timelineStatus,
  subscribeTimeline,
  clearSessionUndoHistory,
  discardDraftHistory,
} from "../workspace/timeline.ts";
export {
  recordCanvasChange,
  discardCanvasHistory,
  discardDraftHistory,
  clearSessionUndoHistory,
  createChangeHistoryGroup,
} from "../workspace/timeline.ts";

export interface DraftContents {
  readonly changes: readonly ChangeRecord[];
  readonly structuralChanges: readonly StructuralChange[];
}

export interface DraftChangesSnapshot extends DraftContents {
  readonly draftId: string;
  readonly revision: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

interface DraftState {
  readonly id: string;
  revision: number;
  contents: DraftContents;
  activate?: () => void;
}

const drafts = new Map<string, DraftState>();
const lockedDrafts = new Set<string>();
const listeners = new Set<() => void>();
const draftListeners = new Set<(draftId: string) => void>();
/** Until a frame is activated, edits belong to the current page's draft. */
let activeDraftId: string | null = null;

function activeId(): string {
  return activeDraftId ??= targetKey(applicationTarget());
}

function draftState(id = activeId()): DraftState {
  let draft = drafts.get(id);
  if (!draft) {
    draft = { id, revision: 0, contents: { changes: [], structuralChanges: [] } };
    drafts.set(id, draft);
  }
  return draft;
}

export function lockDraft(id: string): () => void {
  if (lockedDrafts.has(id)) throw new Error("This iteration is already saving.");
  lockedDrafts.add(id);
  return () => { lockedDrafts.delete(id); };
}

export function isDraftLocked(id?: string): boolean {
  return id === undefined ? lockedDrafts.size > 0 : lockedDrafts.has(id);
}

export function canEditDraft(id = activeId()): boolean {
  return canWriteWorkspace() && !lockedDrafts.has(id);
}

export function setActiveDraft(id: string, activate?: () => void): void {
  draftState(id).activate = activate;
  if (activeId() === id) return;
  activeDraftId = id;
  publishSelection();
}

export type DraftProjector = (snapshot: DraftChangesSnapshot) => void;
export type CommitResult = "applied" | "unchanged" | "blocked";

export interface DraftChangeStore {
  getSnapshot(): DraftChangesSnapshot;
  subscribe(listener: () => void): () => void;
  commitChangeRecords(incoming: readonly ChangeRecord[]): CommitResult;
  revertChangeRecord(change: ChangeRecord): boolean;
  discardChangeRecords(
    target: { kind: "selector"; selector: string } | { kind: "instance-override"; id: string },
  ): boolean;
  commitStructuralChange(change: StructuralChange): boolean;
  revertStructuralChangeRecord(changeId: string): boolean;
  /** Replaces the active draft as one undoable edit. */
  commitContents(next: DraftContents): boolean;
  reconcileActiveDraftChanges(
    verifiedKeys: ReadonlySet<string>,
    verifiedStructuralIds: ReadonlySet<string>,
  ): number;
  undoChange(): boolean;
  redoChange(): boolean;
  restoreActiveDraftChanges(next: DraftContents, preserveHistory?: boolean): void;
  clearActiveDraftChanges(): void;
}

let snapshot: DraftChangesSnapshot | null = null;

function cloneContents(value: DraftContents): DraftContents {
  return {
    changes: value.changes.map((change) => cloneValue(change)),
    structuralChanges: value.structuralChanges.map((change) => cloneValue(change)),
  };
}

function cloneValue<T>(value: T, key?: string): T {
  if (key === "oldToken" || key === "newToken") return value;
  if (Array.isArray(value)) return value.map((item) => cloneValue(item)) as T;
  if (value !== null && typeof value === "object") {
    const clone: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(value)) {
      clone[key] = cloneValue(child, key);
    }
    return clone as T;
  }
  return value;
}

function freezeValue<T>(value: T, key?: string): T {
  if (key === "oldToken" || key === "newToken") return value;
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const [childKey, child] of Object.entries(value)) freezeValue(child, childKey);
    Object.freeze(value);
  }
  return value;
}

function createSnapshot(): DraftChangesSnapshot {
  const draft = draftState();
  return Object.freeze({ draftId: draft.id, revision: draft.revision, ...draft.contents, ...timelineStatus() });
}

let notificationDepth = 0;
let notificationPending = false;
function mutate<T>(operation: () => T): T {
  notificationDepth += 1;
  try {
    return operation();
  } finally {
    notificationDepth -= 1;
    if (notificationDepth === 0 && notificationPending) {
      notificationPending = false;
      publishSelection();
    }
  }
}

function publishSelection(): void {
  if (notificationDepth > 0) { notificationPending = true; return; }
  snapshot = null;
  for (const listener of listeners) listener();
}

subscribeTimeline(publishSelection);

function replaceContents(draft: DraftState, next: DraftContents): void {
  draft.contents = freezeValue(cloneContents(next));
  draft.revision += 1;
  for (const listener of draftListeners) listener(draft.id);
  publishSelection();
}

export function subscribeDraftChanges(listener: (draftId: string) => void): () => void {
  draftListeners.add(listener);
  return () => draftListeners.delete(listener);
}

export function getDraftChanges(id: string): DraftChangesSnapshot {
  const draft = drafts.get(id);
  return {
    draftId: id,
    revision: draft?.revision ?? 0,
    changes: draft?.contents.changes ?? [],
    structuralChanges: draft?.contents.structuralChanges ?? [],
    ...timelineStatus(),
  };
}

export function restoreDraftChanges(id: string, next: DraftContents, revision = 1): void {
  const draft = draftState(id);
  draft.contents = freezeValue(cloneContents(next));
  draft.revision = revision;
  publishSelection();
}

function commit(next: DraftContents): boolean {
  if (!canEditDraft()) return false;
  const draft = draftState();
  const before = draft.contents;
  mutate(() => {
    replaceContents(draft, next);
    recordEdit({ draftId: draft.id, activate: draft.activate, before, after: draft.contents }, sameDraftContents);
  });
  return true;
}

function getSnapshot(): DraftChangesSnapshot { return snapshot ??= createSnapshot(); }
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function commitChangeRecordsImpl(incoming: readonly ChangeRecord[]): CommitResult {
  if (incoming.length === 0) return "unchanged";
  const contents = draftState().contents;
  const changes = incoming.reduce((current, change) => mergeChange(current, change), [...contents.changes]);
  if (sameEffectiveChanges([...contents.changes], changes)) return "unchanged";
  return commit({ ...contents, changes }) ? "applied" : "blocked";
}

function revertChangeRecordImpl(change: ChangeRecord): boolean {
  const contents = draftState().contents;
  const changes = contents.changes.filter((candidate) => changeKey(candidate) !== changeKey(change));
  return changes.length !== contents.changes.length && commit({ ...contents, changes });
}

function discardChangeRecordsImpl(target: { kind: "selector"; selector: string } | { kind: "instance-override"; id: string }): boolean {
  const contents = draftState().contents;
  const changes = contents.changes.filter((change) => target.kind === "selector"
    ? selectorForChange(change) !== target.selector
    : !isElementChange(change) || change.instanceOverride?.id !== target.id);
  return changes.length !== contents.changes.length && commit({ ...contents, changes });
}

function commitStructuralChangeImpl(change: StructuralChange): boolean {
  const contents = draftState().contents;
  if (contents.structuralChanges.some((candidate) => candidate.id === change.id)) return false;
  return commit({ ...contents, structuralChanges: [...contents.structuralChanges, change] });
}

function revertStructuralChangeRecordImpl(changeId: string): boolean {
  const contents = draftState().contents;
  const structuralChanges = contents.structuralChanges.filter((change) => change.id !== changeId);
  return structuralChanges.length !== contents.structuralChanges.length && commit({ ...contents, structuralChanges });
}

function commitContentsImpl(next: DraftContents): boolean {
  return !sameDraftContents(draftState().contents, next) && commit(next);
}

export function reconcileDraftChanges(id: string, verifiedKeys: ReadonlySet<string>, verifiedStructuralIds: ReadonlySet<string>): number {
  if (!canEditDraft(id)) return 0;
  const draft = draftState(id);
  const retain = (value: DraftContents): DraftContents => ({
    changes: value.changes.filter((change) => !verifiedKeys.has(changeKey(change))),
    structuralChanges: value.structuralChanges.filter((change) => !verifiedStructuralIds.has(change.id)),
  });
  const next = retain(draft.contents);
  const removed = draft.contents.changes.length - next.changes.length + draft.contents.structuralChanges.length - next.structuralChanges.length;
  if (removed === 0) return 0;
  mutate(() => {
    replaceContents(draft, next);
    pruneDraftHistory(id, retain, sameDraftContents);
  });
  return removed;
}

function reconcileActiveDraftChangesImpl(keys: ReadonlySet<string>, ids: ReadonlySet<string>): number {
  return reconcileDraftChanges(activeId(), keys, ids);
}

function sameDraftContents(left: DraftContents, right: DraftContents): boolean {
  return sameEffectiveChanges([...left.changes], [...right.changes])
    && JSON.stringify(left.structuralChanges) === JSON.stringify(right.structuralChanges);
}

function replay(direction: "undo" | "redo"): boolean {
  if (isDraftLocked() || !canWriteWorkspace()) return false;
  return mutate(() => replayTimeline(direction, (entry, next) => {
    replaceContents(draftState(entry.draftId), next);
    entry.activate?.();
    if (!entry.activate) setActiveDraft(entry.draftId);
  }));
}

function restoreActiveDraftChangesImpl(next: DraftContents, preserveHistory = false): void {
  mutate(() => {
    replaceContents(draftState(), next);
    if (!preserveHistory) clearSessionUndoHistory();
  });
}

export function clearDraftChanges(id: string, expectedRevision?: number): boolean {
  const draft = draftState(id);
  if (!canEditDraft(id) || (expectedRevision !== undefined && draft.revision !== expectedRevision)) return false;
  mutate(() => {
    replaceContents(draft, { changes: [], structuralChanges: [] });
    discardDraftHistory(id);
  });
  return true;
}

export function listDraftIds(): readonly string[] {
  return [...drafts.keys()];
}

/** Drops a draft whose content no longer exists, such as a deleted iteration. */
export function forgetDraft(id: string): void {
  if (!drafts.has(id) || lockedDrafts.has(id)) return;
  discardDraftHistory(id);
  drafts.delete(id);
  for (const listener of draftListeners) listener(id);
  publishSelection();
}

function clearActiveDraftChangesImpl(): void { clearDraftChanges(activeId()); }

function resetDraftChangesImpl(): void {
  drafts.clear();
  lockedDrafts.clear();
  activeDraftId = null;
  clearSessionUndoHistory();
  publishSelection();
}

export const draftChangeStore: DraftChangeStore = {
  getSnapshot, subscribe,
  commitChangeRecords: commitChangeRecordsImpl,
  revertChangeRecord: revertChangeRecordImpl,
  discardChangeRecords: discardChangeRecordsImpl,
  commitStructuralChange: commitStructuralChangeImpl,
  revertStructuralChangeRecord: revertStructuralChangeRecordImpl,
  commitContents: commitContentsImpl,
  reconcileActiveDraftChanges: reconcileActiveDraftChangesImpl,
  undoChange: () => replay("undo"),
  redoChange: () => replay("redo"),
  restoreActiveDraftChanges: restoreActiveDraftChangesImpl,
  clearActiveDraftChanges: clearActiveDraftChangesImpl,
};

export function getActiveDraftChanges(): DraftChangesSnapshot {
  return draftChangeStore.getSnapshot();
}

export function subscribeActiveDraftChanges(listener: () => void): () => void {
  return draftChangeStore.subscribe(listener);
}

export function commitChangeRecords(
  incoming: readonly ChangeRecord[],
  project: DraftProjector,
): CommitResult {
  const result = draftChangeStore.commitChangeRecords(incoming);
  if (result === "applied") project(draftChangeStore.getSnapshot());
  return result;
}

export function commitStructuralChange(change: StructuralChange, project: DraftProjector): boolean {
  const changed = draftChangeStore.commitStructuralChange(change);
  if (changed) project(draftChangeStore.getSnapshot());
  return changed;
}

export function undoChange(project: DraftProjector): boolean {
  const changed = draftChangeStore.undoChange();
  if (changed) project(draftChangeStore.getSnapshot());
  return changed;
}

export function redoChange(project: DraftProjector): boolean {
  const changed = draftChangeStore.redoChange();
  if (changed) project(draftChangeStore.getSnapshot());
  return changed;
}

export function restoreActiveDraftChanges(next: DraftContents, project: DraftProjector): void {
  draftChangeStore.restoreActiveDraftChanges(next);
  project(draftChangeStore.getSnapshot());
}

export function resetDraftChanges(): void {
  resetDraftChangesImpl();
}
