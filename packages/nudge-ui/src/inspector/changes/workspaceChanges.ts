import { canWriteWorkspace } from "../canvas/workspaceLease.ts";
import { changeKey, mergeChange, sameEffectiveChanges, selectorForChange } from "./model.ts";
import { isElementChange } from "./types.ts";
import type { ChangeRecord } from "./types.ts";
import type { StructuralChange } from "./structuralTypes.ts";

export interface WorkspaceContents {
  readonly changes: readonly ChangeRecord[];
  readonly structuralChanges: readonly StructuralChange[];
}

export interface WorkspaceChangesSnapshot extends WorkspaceContents {
  readonly revision: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
}

interface HistoryEntry {
  readonly group?: symbol;
  readonly before: WorkspaceContents;
  readonly after: WorkspaceContents;
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
  restoreWorkspaceChanges(next: WorkspaceContents): void;
  clearWorkspaceChanges(): void;
}

let contents: WorkspaceContents = { changes: [], structuralChanges: [] };
let revision = 0;
let undoStack: HistoryEntry[] = [];
let redoStack: HistoryEntry[] = [];
let activeHistoryGroup: symbol | undefined;
let snapshot = createSnapshot();
const listeners = new Set<() => void>();

function cloneContents(value: WorkspaceContents): WorkspaceContents {
  return {
    changes: value.changes.map((change) => cloneValue(change)),
    structuralChanges: value.structuralChanges.map((change) => cloneValue(change)),
  };
}

function cloneValue<T>(value: T, key?: string): T {
  // Token entries belong to the shared catalog. Preserve their identity so
  // callers can continue to correlate a change with its catalog entry.
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
  const snapshotContents = freezeValue(cloneContents(contents));
  return Object.freeze({
    revision,
    changes: snapshotContents.changes,
    structuralChanges: snapshotContents.structuralChanges,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  });
}

function publish(): void {
  revision += 1;
  snapshot = createSnapshot();
  for (const listener of listeners) listener();
}

function commit(next: WorkspaceContents): boolean {
  if (!canWriteWorkspace()) return false;
  const before = cloneContents(contents);
  contents = cloneContents(next);
  const previous = undoStack.at(-1);
  const entry: HistoryEntry = {
    before: activeHistoryGroup && previous?.group === activeHistoryGroup ? previous.before : before,
    after: cloneContents(contents),
    group: activeHistoryGroup,
  };
  if (activeHistoryGroup && previous?.group === activeHistoryGroup) undoStack.pop();
  if (!sameWorkspaceContents(entry.before, entry.after)) undoStack.push(entry);
  redoStack = [];
  publish();
  return true;
}

/** Groups consecutive synchronous updates from one gesture into one undo step.
 * Updates outside the callback keep their own history entries.
 */
export function createChangeHistoryGroup(): (update: () => void) => void {
  const group = Symbol("change-history-group");
  return (update) => {
    const previous = activeHistoryGroup;
    activeHistoryGroup = group;
    try {
      update();
    } finally {
      activeHistoryGroup = previous;
    }
  };
}

function getSnapshot(): WorkspaceChangesSnapshot {
  return snapshot;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function commitChangeRecordsImpl(
  incoming: readonly ChangeRecord[],
): CommitResult {
  if (incoming.length === 0) return "unchanged";
  const nextChanges = incoming.reduce(
    (current, change) => mergeChange(current, change),
    [...contents.changes],
  );
  if (sameEffectiveChanges([...contents.changes], nextChanges)) return "unchanged";
  return commit({ ...contents, changes: nextChanges }) ? "applied" : "blocked";
}

function revertChangeRecordImpl(change: ChangeRecord): boolean {
  const key = changeKey(change);
  const changes = contents.changes.filter((candidate) => changeKey(candidate) !== key);
  if (changes.length === contents.changes.length) return false;
  return commit({ ...contents, changes });
}

function discardChangeRecordsImpl(
  target: { kind: "selector"; selector: string } | { kind: "instance-override"; id: string },
): boolean {
  const changes = contents.changes.filter((change) => target.kind === "selector"
    ? selectorForChange(change) !== target.selector
    : !isElementChange(change) || change.instanceOverride?.id !== target.id);
  if (changes.length === contents.changes.length) return false;
  return commit({ ...contents, changes });
}

function commitStructuralChangeImpl(change: StructuralChange): boolean {
  if (contents.structuralChanges.some((candidate) => candidate.id === change.id)) return false;
  return commit({
    ...contents,
    structuralChanges: [...contents.structuralChanges, change],
  });
}

function revertStructuralChangeRecordImpl(changeId: string): boolean {
  const structuralChanges = contents.structuralChanges.filter((change) => change.id !== changeId);
  if (structuralChanges.length === contents.structuralChanges.length) return false;
  return commit({ ...contents, structuralChanges });
}

function reconcileWorkspaceChangesImpl(
  verifiedKeys: ReadonlySet<string>,
  verifiedStructuralIds: ReadonlySet<string>,
): number {
  if (!canWriteWorkspace()) return 0;
  const retain = (value: WorkspaceContents): WorkspaceContents => ({
    changes: value.changes.filter((change) => !verifiedKeys.has(changeKey(change))),
    structuralChanges: value.structuralChanges.filter((change) => !verifiedStructuralIds.has(change.id)),
  });
  const next = retain(contents);
  const removed = contents.changes.length - next.changes.length
    + contents.structuralChanges.length - next.structuralChanges.length;
  if (removed === 0) return 0;
  contents = next;
  const prune = (entries: readonly HistoryEntry[]): HistoryEntry[] => entries
    .map((entry) => ({ group: entry.group, before: retain(entry.before), after: retain(entry.after) }))
    .filter((entry) => !sameWorkspaceContents(entry.before, entry.after));
  undoStack = prune(undoStack);
  redoStack = prune(redoStack);
  publish();
  return removed;
}

function sameWorkspaceContents(left: WorkspaceContents, right: WorkspaceContents): boolean {
  return sameEffectiveChanges([...left.changes], [...right.changes])
    && sameStructuralChanges(left.structuralChanges, right.structuralChanges);
}

function sameStructuralChanges(
  left: readonly StructuralChange[],
  right: readonly StructuralChange[],
): boolean {
  // Structural intent is an ordered list of small, immutable JSON records.
  // Equality must include operation order and the complete target payload.
  return JSON.stringify(left) === JSON.stringify(right);
}

function undoWorkspaceChangeImpl(): boolean {
  if (!canWriteWorkspace()) return false;
  const entry = undoStack.at(-1);
  if (!entry) return false;
  undoStack.pop();
  contents = cloneContents(entry.before);
  redoStack.push(entry);
  publish();
  return true;
}

function redoWorkspaceChangeImpl(): boolean {
  if (!canWriteWorkspace()) return false;
  const entry = redoStack.at(-1);
  if (!entry) return false;
  redoStack.pop();
  contents = cloneContents(entry.after);
  undoStack.push({ before: entry.before, after: entry.after });
  publish();
  return true;
}

function restoreWorkspaceChangesImpl(next: WorkspaceContents): void {
  contents = cloneContents(next);
  undoStack = [];
  redoStack = [];
  publish();
}

function clearWorkspaceChangesImpl(): void {
  contents = { changes: [], structuralChanges: [] };
  undoStack = [];
  redoStack = [];
  publish();
}

/** Resets controller state for teardown and tests without requiring a lease. */
function resetWorkspaceChangesImpl(): void {
  contents = { changes: [], structuralChanges: [] };
  undoStack = [];
  redoStack = [];
  revision = 0;
  snapshot = createSnapshot();
  for (const listener of listeners) listener();
}

export const workspaceChangeStore: WorkspaceChangeStore = {
  getSnapshot,
  subscribe,
  commitChangeRecords: commitChangeRecordsImpl,
  revertChangeRecord: revertChangeRecordImpl,
  discardChangeRecords: discardChangeRecordsImpl,
  commitStructuralChange: commitStructuralChangeImpl,
  revertStructuralChangeRecord: revertStructuralChangeRecordImpl,
  reconcileWorkspaceChanges: reconcileWorkspaceChangesImpl,
  undoWorkspaceChange: undoWorkspaceChangeImpl,
  redoWorkspaceChange: redoWorkspaceChangeImpl,
  restoreWorkspaceChanges: restoreWorkspaceChangesImpl,
  clearWorkspaceChanges: clearWorkspaceChangesImpl,
};

/** Compatibility accessors retained for callers that have not adopted the store seam. */
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
