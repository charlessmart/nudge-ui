import { canWriteWorkspace } from "../canvas/workspaceLease.ts";
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
  discardWorkspaceHistory,
} from "../workspace/timeline.ts";
export {
  recordCanvasCreation,
  discardCanvasHistory,
  discardWorkspaceHistory,
  clearSessionUndoHistory,
  createChangeHistoryGroup,
} from "../workspace/timeline.ts";

export interface WorkspaceContents {
  readonly changes: readonly ChangeRecord[];
  readonly structuralChanges: readonly StructuralChange[];
}

export interface WorkspaceChangesSnapshot extends WorkspaceContents {
  readonly draftId: string;
  readonly revision: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

interface DraftWorkspace {
  readonly id: string;
  revision: number;
  contents: WorkspaceContents;
  activate?: () => void;
}

const drafts = new Map<string, DraftWorkspace>();
const lockedDrafts = new Set<string>();
const listeners = new Set<() => void>();
const draftListeners = new Set<(draftId: string) => void>();
let activeDraftId = "workspace";

function draftWorkspace(id = activeDraftId): DraftWorkspace {
  let draft = drafts.get(id);
  if (!draft) {
    draft = { id, revision: 0, contents: { changes: [], structuralChanges: [] } };
    drafts.set(id, draft);
  }
  return draft;
}

export function lockWorkspaceHistory(id: string): () => void {
  if (lockedDrafts.has(id)) throw new Error("This study is already saving.");
  lockedDrafts.add(id);
  return () => { lockedDrafts.delete(id); };
}

export function isWorkspaceHistoryLocked(id?: string): boolean {
  return id === undefined ? lockedDrafts.size > 0 : lockedDrafts.has(id);
}

export function canEditWorkspace(id = activeDraftId): boolean {
  return canWriteWorkspace() && !lockedDrafts.has(id);
}

export function setWorkspaceHistoryContext(id: string, activate?: () => void): void {
  draftWorkspace(id).activate = activate;
  if (activeDraftId === id) return;
  activeDraftId = id;
  publishSelection();
}

export type WorkspaceProjector = (snapshot: WorkspaceChangesSnapshot) => void;
export type CommitResult = "applied" | "unchanged" | "blocked";

export interface WorkspaceChangeStore {
  getSnapshot(): WorkspaceChangesSnapshot;
  subscribe(listener: () => void): () => void;
  commitChangeRecords(incoming: readonly ChangeRecord[]): CommitResult;
  revertChangeRecord(change: ChangeRecord): boolean;
  discardChangeRecords(
    target: { kind: "selector"; selector: string } | { kind: "instance-override"; id: string },
  ): boolean;
  commitStructuralChange(change: StructuralChange): boolean;
  revertStructuralChangeRecord(changeId: string): boolean;
  reconcileWorkspaceChanges(
    verifiedKeys: ReadonlySet<string>,
    verifiedStructuralIds: ReadonlySet<string>,
  ): number;
  undoWorkspaceChange(): boolean;
  redoWorkspaceChange(): boolean;
  restoreWorkspaceChanges(next: WorkspaceContents, preserveHistory?: boolean): void;
  clearWorkspaceChanges(): void;
}

let snapshot = createSnapshot();

function cloneContents(value: WorkspaceContents): WorkspaceContents {
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

function createSnapshot(): WorkspaceChangesSnapshot {
  const draft = draftWorkspace();
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
  snapshot = createSnapshot();
  for (const listener of listeners) listener();
}

subscribeTimeline(publishSelection);

function replaceContents(draft: DraftWorkspace, next: WorkspaceContents): void {
  draft.contents = freezeValue(cloneContents(next));
  draft.revision += 1;
  for (const listener of draftListeners) listener(draft.id);
  publishSelection();
}

export function subscribeDraftWorkspaces(listener: (draftId: string) => void): () => void {
  draftListeners.add(listener);
  return () => draftListeners.delete(listener);
}

export function getDraftWorkspace(id: string): WorkspaceChangesSnapshot {
  const draft = drafts.get(id);
  return {
    draftId: id,
    revision: draft?.revision ?? 0,
    changes: draft?.contents.changes ?? [],
    structuralChanges: draft?.contents.structuralChanges ?? [],
    ...timelineStatus(),
  };
}

export function restoreDraftWorkspace(id: string, next: WorkspaceContents, revision = 1): void {
  const draft = draftWorkspace(id);
  draft.contents = freezeValue(cloneContents(next));
  draft.revision = revision;
  publishSelection();
}

function commit(next: WorkspaceContents): boolean {
  if (!canEditWorkspace()) return false;
  const draft = draftWorkspace();
  const before = draft.contents;
  mutate(() => {
    replaceContents(draft, next);
    recordEdit({ draftId: draft.id, activate: draft.activate, before, after: draft.contents }, sameWorkspaceContents);
  });
  return true;
}

function getSnapshot(): WorkspaceChangesSnapshot { return snapshot; }
function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function commitChangeRecordsImpl(incoming: readonly ChangeRecord[]): CommitResult {
  if (incoming.length === 0) return "unchanged";
  const contents = draftWorkspace().contents;
  const changes = incoming.reduce((current, change) => mergeChange(current, change), [...contents.changes]);
  if (sameEffectiveChanges([...contents.changes], changes)) return "unchanged";
  return commit({ ...contents, changes }) ? "applied" : "blocked";
}

function revertChangeRecordImpl(change: ChangeRecord): boolean {
  const contents = draftWorkspace().contents;
  const changes = contents.changes.filter((candidate) => changeKey(candidate) !== changeKey(change));
  return changes.length !== contents.changes.length && commit({ ...contents, changes });
}

function discardChangeRecordsImpl(target: { kind: "selector"; selector: string } | { kind: "instance-override"; id: string }): boolean {
  const contents = draftWorkspace().contents;
  const changes = contents.changes.filter((change) => target.kind === "selector"
    ? selectorForChange(change) !== target.selector
    : !isElementChange(change) || change.instanceOverride?.id !== target.id);
  return changes.length !== contents.changes.length && commit({ ...contents, changes });
}

function commitStructuralChangeImpl(change: StructuralChange): boolean {
  const contents = draftWorkspace().contents;
  if (contents.structuralChanges.some((candidate) => candidate.id === change.id)) return false;
  return commit({ ...contents, structuralChanges: [...contents.structuralChanges, change] });
}

function revertStructuralChangeRecordImpl(changeId: string): boolean {
  const contents = draftWorkspace().contents;
  const structuralChanges = contents.structuralChanges.filter((change) => change.id !== changeId);
  return structuralChanges.length !== contents.structuralChanges.length && commit({ ...contents, structuralChanges });
}

export function reconcileDraftWorkspace(id: string, verifiedKeys: ReadonlySet<string>, verifiedStructuralIds: ReadonlySet<string>): number {
  if (!canEditWorkspace(id)) return 0;
  const draft = draftWorkspace(id);
  const retain = (value: WorkspaceContents): WorkspaceContents => ({
    changes: value.changes.filter((change) => !verifiedKeys.has(changeKey(change))),
    structuralChanges: value.structuralChanges.filter((change) => !verifiedStructuralIds.has(change.id)),
  });
  const next = retain(draft.contents);
  const removed = draft.contents.changes.length - next.changes.length + draft.contents.structuralChanges.length - next.structuralChanges.length;
  if (removed === 0) return 0;
  mutate(() => {
    replaceContents(draft, next);
    pruneDraftHistory(id, retain, sameWorkspaceContents);
  });
  return removed;
}

function reconcileWorkspaceChangesImpl(keys: ReadonlySet<string>, ids: ReadonlySet<string>): number {
  return reconcileDraftWorkspace(activeDraftId, keys, ids);
}

function sameWorkspaceContents(left: WorkspaceContents, right: WorkspaceContents): boolean {
  return sameEffectiveChanges([...left.changes], [...right.changes])
    && JSON.stringify(left.structuralChanges) === JSON.stringify(right.structuralChanges);
}

function replay(direction: "undo" | "redo"): boolean {
  if (isWorkspaceHistoryLocked() || !canWriteWorkspace()) return false;
  return mutate(() => replayTimeline(direction, (entry, next) => {
    replaceContents(draftWorkspace(entry.draftId), next);
    entry.activate?.();
    if (!entry.activate) setWorkspaceHistoryContext(entry.draftId);
  }));
}

function restoreWorkspaceChangesImpl(next: WorkspaceContents, preserveHistory = false): void {
  mutate(() => {
    replaceContents(draftWorkspace(), next);
    if (!preserveHistory) clearSessionUndoHistory();
  });
}

export function clearDraftWorkspace(id: string, expectedRevision?: number): boolean {
  const draft = draftWorkspace(id);
  if (!canEditWorkspace(id) || (expectedRevision !== undefined && draft.revision !== expectedRevision)) return false;
  mutate(() => {
    replaceContents(draft, { changes: [], structuralChanges: [] });
    discardWorkspaceHistory(id);
  });
  return true;
}

function clearWorkspaceChangesImpl(): void { clearDraftWorkspace(activeDraftId); }

function resetWorkspaceChangesImpl(): void {
  drafts.clear();
  lockedDrafts.clear();
  activeDraftId = "workspace";
  clearSessionUndoHistory();
  publishSelection();
}

export const workspaceChangeStore: WorkspaceChangeStore = {
  getSnapshot, subscribe,
  commitChangeRecords: commitChangeRecordsImpl,
  revertChangeRecord: revertChangeRecordImpl,
  discardChangeRecords: discardChangeRecordsImpl,
  commitStructuralChange: commitStructuralChangeImpl,
  revertStructuralChangeRecord: revertStructuralChangeRecordImpl,
  reconcileWorkspaceChanges: reconcileWorkspaceChangesImpl,
  undoWorkspaceChange: () => replay("undo"),
  redoWorkspaceChange: () => replay("redo"),
  restoreWorkspaceChanges: restoreWorkspaceChangesImpl,
  clearWorkspaceChanges: clearWorkspaceChangesImpl,
};

export function getWorkspaceChanges(): WorkspaceChangesSnapshot {
  return workspaceChangeStore.getSnapshot();
}

export function subscribeWorkspaceChanges(listener: () => void): () => void {
  return workspaceChangeStore.subscribe(listener);
}

export function commitChangeRecords(
  incoming: readonly ChangeRecord[],
  project: WorkspaceProjector,
): CommitResult {
  const result = workspaceChangeStore.commitChangeRecords(incoming);
  if (result === "applied") project(workspaceChangeStore.getSnapshot());
  return result;
}

export function commitStructuralChange(change: StructuralChange, project: WorkspaceProjector): boolean {
  const changed = workspaceChangeStore.commitStructuralChange(change);
  if (changed) project(workspaceChangeStore.getSnapshot());
  return changed;
}

export function undoWorkspaceChange(project: WorkspaceProjector): boolean {
  const changed = workspaceChangeStore.undoWorkspaceChange();
  if (changed) project(workspaceChangeStore.getSnapshot());
  return changed;
}

export function redoWorkspaceChange(project: WorkspaceProjector): boolean {
  const changed = workspaceChangeStore.redoWorkspaceChange();
  if (changed) project(workspaceChangeStore.getSnapshot());
  return changed;
}

export function restoreWorkspaceChanges(next: WorkspaceContents, project: WorkspaceProjector): void {
  workspaceChangeStore.restoreWorkspaceChanges(next);
  project(workspaceChangeStore.getSnapshot());
}

export function resetWorkspaceChanges(): void {
  resetWorkspaceChangesImpl();
}
