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
  readonly before: WorkspaceContents;
  readonly after: WorkspaceContents;
}

type WorkspaceProjector = (snapshot: WorkspaceChangesSnapshot) => void;

let contents: WorkspaceContents = { changes: [], structuralChanges: [] };
let revision = 0;
let undoStack: HistoryEntry[] = [];
let redoStack: HistoryEntry[] = [];
let snapshot = createSnapshot();
const listeners = new Set<() => void>();

function cloneContents(value: WorkspaceContents): WorkspaceContents {
  return {
    changes: [...value.changes],
    structuralChanges: [...value.structuralChanges],
  };
}

function createSnapshot(): WorkspaceChangesSnapshot {
  return {
    revision,
    changes: contents.changes,
    structuralChanges: contents.structuralChanges,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
  };
}

function publish(project: WorkspaceProjector): void {
  revision += 1;
  snapshot = createSnapshot();
  project(snapshot);
  for (const listener of listeners) listener();
}

function commit(next: WorkspaceContents, project: WorkspaceProjector): boolean {
  if (!canWriteWorkspace()) return false;
  const before = cloneContents(contents);
  contents = cloneContents(next);
  undoStack.push({ before, after: cloneContents(contents) });
  redoStack = [];
  publish(project);
  return true;
}

export function getWorkspaceChanges(): WorkspaceChangesSnapshot {
  return snapshot;
}

export function subscribeWorkspaceChanges(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function commitChangeRecords(
  incoming: readonly ChangeRecord[],
  project: WorkspaceProjector,
): boolean {
  if (incoming.length === 0) return false;
  const nextChanges = incoming.reduce(
    (current, change) => mergeChange(current, change),
    [...contents.changes],
  );
  if (sameEffectiveChanges([...contents.changes], nextChanges)) return false;
  return commit({ ...contents, changes: nextChanges }, project);
}

export function revertChangeRecord(change: ChangeRecord, project: WorkspaceProjector): boolean {
  const key = changeKey(change);
  const changes = contents.changes.filter((candidate) => changeKey(candidate) !== key);
  if (changes.length === contents.changes.length) return false;
  return commit({ ...contents, changes }, project);
}

export function discardChangeRecords(
  target: { kind: "selector"; selector: string } | { kind: "instance-override"; id: string },
  project: WorkspaceProjector,
): boolean {
  const changes = contents.changes.filter((change) => target.kind === "selector"
    ? selectorForChange(change) !== target.selector
    : !isElementChange(change) || change.instanceOverride?.id !== target.id);
  if (changes.length === contents.changes.length) return false;
  return commit({ ...contents, changes }, project);
}

export function commitStructuralChange(change: StructuralChange, project: WorkspaceProjector): boolean {
  if (contents.structuralChanges.some((candidate) => candidate.id === change.id)) return false;
  return commit({
    ...contents,
    structuralChanges: [...contents.structuralChanges, change],
  }, project);
}

export function revertStructuralChangeRecord(changeId: string, project: WorkspaceProjector): boolean {
  const structuralChanges = contents.structuralChanges.filter((change) => change.id !== changeId);
  if (structuralChanges.length === contents.structuralChanges.length) return false;
  return commit({ ...contents, structuralChanges }, project);
}

export function reconcileWorkspaceChanges(
  verifiedKeys: ReadonlySet<string>,
  verifiedStructuralIds: ReadonlySet<string>,
  project: WorkspaceProjector,
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
    .map((entry) => ({ before: retain(entry.before), after: retain(entry.after) }))
    .filter((entry) => !sameWorkspaceContents(entry.before, entry.after));
  undoStack = prune(undoStack);
  redoStack = prune(redoStack);
  publish(project);
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

export function undoWorkspaceChange(project: WorkspaceProjector): boolean {
  if (!canWriteWorkspace()) return false;
  const entry = undoStack.at(-1);
  if (!entry) return false;
  undoStack.pop();
  contents = cloneContents(entry.before);
  redoStack.push(entry);
  publish(project);
  return true;
}

export function redoWorkspaceChange(project: WorkspaceProjector): boolean {
  if (!canWriteWorkspace()) return false;
  const entry = redoStack.at(-1);
  if (!entry) return false;
  redoStack.pop();
  contents = cloneContents(entry.after);
  undoStack.push(entry);
  publish(project);
  return true;
}

export function restoreWorkspaceChanges(next: WorkspaceContents, project: WorkspaceProjector): void {
  contents = cloneContents(next);
  undoStack = [];
  redoStack = [];
  publish(project);
}

export function clearWorkspaceChanges(project: WorkspaceProjector): void {
  contents = { changes: [], structuralChanges: [] };
  undoStack = [];
  redoStack = [];
  publish(project);
}

/** Resets controller state for teardown and tests without requiring a lease. */
export function resetWorkspaceChanges(): void {
  contents = { changes: [], structuralChanges: [] };
  undoStack = [];
  redoStack = [];
  revision = 0;
  snapshot = createSnapshot();
  for (const listener of listeners) listener();
}

/**
 * Publishes updated preview diagnostics without creating user intent, changing
 * history, or advancing the canonical revision. Subscribers still refresh so
 * diagnostic UI and durable session metadata observe the latest result.
 */
export function replaceChangeRecordsForDiagnostics(
  changes: readonly ChangeRecord[],
): void {
  contents = { ...contents, changes: [...changes] };
  snapshot = createSnapshot();
  for (const listener of listeners) listener();
}
