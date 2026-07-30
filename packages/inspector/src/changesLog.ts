import { useSyncExternalStore } from "react";
import { canWriteWorkspace } from "./canvas/workspaceLease.ts";
import {
  changeKey,
  mergeChange,
  sameEffectiveChanges,
  selectorForChange,
} from "./changes/model.ts";
import {
  applyChangeProjections,
  buildManagedStyleRules,
} from "./changes/projection.ts";
import type { StyleRule } from "./managedStylesheet.ts";
import type { ChangeRecord } from "./changes/types.ts";

export {
  isComponentChange,
  isElementChange,
  isPreviewableChange,
  isTokenChange,
} from "./changes/types.ts";
export type {
  ChangeRecord,
  ComponentChangeRecord,
  ElementChangeRecord,
  PreviewableChangeRecord,
  TokenChangeRecord,
} from "./changes/types.ts";

let changes: ChangeRecord[] = [];
interface HistoryEntry { before: ChangeRecord[]; after: ChangeRecord[] }
let undoStack: HistoryEntry[] = [];
let redoStack: HistoryEntry[] = [];
const listeners = new Set<() => void>();

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

function getChangesSnapshot(): ChangeRecord[] {
  return changes;
}

function notify(): void {
  listeners.forEach((l) => l());
}

export function getPendingRules(): StyleRule[] {
  return buildManagedStyleRules(changes);
}

function reapply(): void {
  changes = applyChangeProjections(changes);
}

/** Append several records as one projection and one undoable history entry. */
export function appendChanges(incoming: ChangeRecord[]): void {
  if (!canWriteWorkspace() || incoming.length === 0) return;
  const before = changes;
  const nextChanges = incoming.reduce(
    (current, change) => mergeChange(current, change),
    changes,
  );
  if (sameEffectiveChanges(before, nextChanges)) return;
  changes = nextChanges;
  reapply();
  undoStack = [...undoStack, { before, after: changes }];
  redoStack = [];
  notify();
}

export function appendChange(change: ChangeRecord): void {
  appendChanges([change]);
}

export function revertChange(change: ChangeRecord): void {
  if (!canWriteWorkspace()) return;
  const before = changes;
  const key = changeKey(change);
  const next = changes.filter((c) => changeKey(c) !== key);
  if (next.length === changes.length) return;
  changes = next;
  reapply();
  undoStack = [...undoStack, { before, after: changes }];
  redoStack = [];
  notify();
}

export function discardChangesForSelector(selector: string): void {
  if (!canWriteWorkspace()) return;
  const before = changes;
  changes = changes.filter((change) => selectorForChange(change) !== selector);
  if (changes.length === before.length) return;
  reapply();
  undoStack = [...undoStack, { before, after: changes }];
  redoStack = [];
  notify();
}

export function undo(): boolean {
  if (!canWriteWorkspace()) return false;
  const entry = undoStack.at(-1);
  if (!entry) return false;
  undoStack = undoStack.slice(0, -1);
  changes = entry.before;
  reapply();
  redoStack = [...redoStack, entry];
  notify();
  return true;
}

export function redo(): boolean {
  if (!canWriteWorkspace()) return false;
  const entry = redoStack.at(-1);
  if (!entry) return false;
  redoStack = redoStack.slice(0, -1);
  changes = entry.after;
  reapply();
  undoStack = [...undoStack, entry];
  notify();
  return true;
}

export function loadChanges(incoming: ChangeRecord[]): void {
  changes = [...incoming];
  undoStack = [];
  redoStack = [];
  changes = applyChangeProjections(changes, false);
  notify();
}

export function clearChanges(): void {
  changes = [];
  undoStack = [];
  redoStack = [];
  applyChangeProjections([], false);
  notify();
}

export function getChangesList(): ChangeRecord[] {
  return changes.slice();
}

export { subscribe as subscribeChanges, getChangesSnapshot as getChanges };

export function touchChanges(): void {
  changes = [...changes];
  notify();
}

export function useChanges(): ChangeRecord[] {
  return useSyncExternalStore(subscribe, getChangesSnapshot, getChangesSnapshot);
}
