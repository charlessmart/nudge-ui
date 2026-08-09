import { useSyncExternalStore } from "react";
import { canWriteWorkspace } from "./canvas/workspaceLease.ts";
import { getSelectedElement } from "./selectionStore.ts";
import {
  changeKey,
  mergeChange,
  sameEffectiveChanges,
  selectorForChange,
} from "./changes/model.ts";
import {
  applyChangeProjections,
  buildManagedStyleRules,
  verifyManagedStyleProjection,
} from "./changes/projection.ts";
import type { StyleRule, PreviewResult } from "./managedStylesheet.ts";
import { isComponentChange, isElementChange } from "./changes/types.ts";
import type { ChangeRecord, PreviewableChangeRecord } from "./changes/types.ts";

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

/**
 * Deferred delta verification (0044). Only the keys touched by a mutation are
 * re-verified, and the probe work runs coalesced off the synchronous commit
 * path (requestIdleCallback, falling back to rAF / a macrotask).
 */
let pendingVerificationTargets = new Map<string, HTMLElement | null>();
let verificationHandle: number | null = null;

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

function samePreviewResult(
  a: PreviewResult | undefined,
  b: PreviewResult | undefined,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.status === b.status
    && a.reason === b.reason
    && a.requestedValue === b.requestedValue
    && a.computedValue === b.computedValue;
}

function flushVerification(): void {
  verificationHandle = null;
  const targets = pendingVerificationTargets;
  pendingVerificationTargets = new Map<string, HTMLElement | null>();
  if (targets.size === 0) return;
  const current = changes;
  let updated: ChangeRecord[] | null = null;
  for (let i = 0; i < current.length; i++) {
    const change = current[i]!;
    if (isComponentChange(change)) continue;
    const key = changeKey(change);
    if (!targets.has(key)) continue;
    const verified = verifyManagedStyleProjection(
      change as PreviewableChangeRecord,
      targets.get(key) ?? null,
    );
    if (samePreviewResult(change.previewResult, verified.previewResult)) continue;
    if (!updated) updated = current.slice();
    updated[i] = verified;
  }
  if (updated) {
    changes = updated;
    notify();
  }
}

function scheduleVerification(): void {
  if (verificationHandle !== null) return;
  const view = typeof window !== "undefined" ? window : undefined;
  if (view && typeof view.requestIdleCallback === "function") {
    verificationHandle = view.requestIdleCallback(() => {
      flushVerification();
    }, { timeout: 200 }) as unknown as number;
  } else if (view && typeof view.requestAnimationFrame === "function") {
    verificationHandle = view.requestAnimationFrame(() => {
      flushVerification();
    }) as unknown as number;
  } else {
    verificationHandle = setTimeout(() => {
      flushVerification();
    }, 0) as unknown as number;
  }
}

/**
 * Marks the given change keys for deferred re-verification. Undo/redo/revert
 * re-verify the surviving set (their sheet projection changed globally);
 * a plain commit re-verifies only the records it introduced or merged.
 */
function markForVerification(keys: Iterable<string>): void {
  const selectedElement = getSelectedElement()?.domElement ?? null;
  let added = false;
  for (const key of keys) {
    if (!pendingVerificationTargets.has(key)) added = true;
    // Keep the latest commit context for a merged key. The element may be in
    // an iframe, so this is also the document boundary for verification.
    pendingVerificationTargets.set(key, selectedElement);
  }
  if (added) scheduleVerification();
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
  markForVerification(incoming.map(changeKey));
  undoStack.push({ before, after: changes });
  redoStack.length = 0;
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
  markForVerification(changes.map(changeKey));
  undoStack.push({ before, after: changes });
  redoStack.length = 0;
  notify();
}

export function discardChangesForSelector(selector: string): void {
  if (!canWriteWorkspace()) return;
  const before = changes;
  changes = changes.filter((change) => selectorForChange(change) !== selector);
  if (changes.length === before.length) return;
  reapply();
  markForVerification(changes.map(changeKey));
  undoStack.push({ before, after: changes });
  redoStack.length = 0;
  notify();
}

/** Relink removes every CSS declaration owned by one durable rendered target. */
export function discardChangesForInstanceOverride(overrideId: string): void {
  if (!canWriteWorkspace()) return;
  const before = changes;
  changes = changes.filter((change) =>
    !isElementChange(change) || change.instanceOverride?.id !== overrideId);
  if (changes.length === before.length) return;
  reapply();
  markForVerification(changes.map(changeKey));
  undoStack.push({ before, after: changes });
  redoStack.length = 0;
  notify();
}

export function undo(): boolean {
  if (!canWriteWorkspace()) return false;
  const entry = undoStack.at(-1);
  if (!entry) return false;
  undoStack.pop();
  changes = entry.before;
  reapply();
  markForVerification(changes.map(changeKey));
  redoStack.push(entry);
  notify();
  return true;
}

export function redo(): boolean {
  if (!canWriteWorkspace()) return false;
  const entry = redoStack.at(-1);
  if (!entry) return false;
  redoStack.pop();
  changes = entry.after;
  reapply();
  markForVerification(changes.map(changeKey));
  undoStack.push(entry);
  notify();
  return true;
}

export function loadChanges(incoming: ChangeRecord[]): void {
  // A restored session replaces the change set and may also switch the active
  // document. Do not let a deferred verification from the previous session
  // inspect a newly loaded record with its old selection context.
  pendingVerificationTargets.clear();
  changes = [...incoming];
  undoStack.length = 0;
  redoStack.length = 0;
  changes = applyChangeProjections(changes);
  notify();
}

export function clearChanges(): void {
  changes = [];
  undoStack.length = 0;
  redoStack.length = 0;
  pendingVerificationTargets.clear();
  applyChangeProjections([]);
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
