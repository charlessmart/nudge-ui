import { useSyncExternalStore } from "react";
import { getSelectedElement } from "../selection/selectionStore.ts";
import {
  changeKey,
} from "./model.ts";
import {
  buildManagedStyleRules,
  verifyManagedStyleProjection,
} from "./managedStyleProjection.ts";
import type { StyleRule } from "../projection/managedStylesheet.ts";
import { isPreviewableChange } from "./types.ts";
import type { ChangeRecord } from "./types.ts";
import { cancelInlineTextForClear } from "../inline-text/inlineTextLifecycle.ts";
import {
  workspaceChangeStore,
  type CommitResult,
  type WorkspaceChangesSnapshot,
} from "./workspaceChanges.ts";
import {
  beginPreviewAttempt,
  clearPreviewDiagnostics,
  getHostPreviewDocument,
  publishPreviewDiagnostic,
} from "./previewDiagnostics.ts";
import { clearStructuralProjectionReports, pruneStructuralProjectionReports } from "../projection/structuralProjection.ts";
import type { StructuralChange } from "./structuralTypes.ts";
import {
  applyHostWorkspaceProjection,
  compileWorkspaceProjection,
} from "../projection/workspaceProjection.ts";

export {
  isComponentChange,
  isElementChange,
  isTextContentChange,
  isTextContentChangeValue,
  isPreviewableChange,
  isTokenChange,
} from "./types.ts";
export type {
  ChangeRecord,
  ComponentChangeRecord,
  ElementChangeRecord,
  PreviewableChangeRecord,
  TextContentChangeRecord,
  TokenChangeRecord,
  RuntimeElementEvidence,
} from "./types.ts";

/**
 * Deferred delta verification (0044). Only the keys touched by a mutation are
 * re-verified, and the probe work runs coalesced off the synchronous commit
 * path (requestIdleCallback, falling back to rAF / a macrotask).
 */
let pendingVerificationTargets = new Map<string, HTMLElement | null>();
let verificationHandle: number | ReturnType<typeof setTimeout> | null = null;

export interface AppendChangesOptions {
  /** The rendered target captured for each change key at commit time. */
  verificationTargets?: ReadonlyMap<string, HTMLElement | null>;
}

function subscribe(cb: () => void): () => void {
  return workspaceChangeStore.subscribe(cb);
}

function getChangesSnapshot(): ChangeRecord[] {
  // SAFETY: The public change model is the concrete record union stored by
  // the workspace snapshot; this module preserves the mutable array facade.
  return workspaceChangeStore.getSnapshot().changes as ChangeRecord[];
}

export function getPendingRules(): StyleRule[] {
  return buildManagedStyleRules(getChangesSnapshot());
}

function reapply(workspace: WorkspaceChangesSnapshot): void {
  applyHostWorkspaceProjection(compileWorkspaceProjection(workspace));
}

function flushVerification(): void {
  verificationHandle = null;
  const targets = pendingVerificationTargets;
  pendingVerificationTargets = new Map<string, HTMLElement | null>();
  if (targets.size === 0) return;
  const current = getChangesSnapshot();
  const attempt = beginPreviewAttempt(
    getHostPreviewDocument(),
    workspaceChangeStore.getSnapshot().revision,
  );
  if (!attempt) return;
  for (let i = 0; i < current.length; i++) {
    const change = current[i]!;
    if (!isPreviewableChange(change)) continue;
    const key = changeKey(change);
    if (!targets.has(key)) continue;
    const result = verifyManagedStyleProjection(
      change,
      targets.get(key) ?? null,
    );
    if (result) {
      publishPreviewDiagnostic(attempt, key, result);
    }
  }
}

function scheduleVerification(): void {
  if (verificationHandle !== null) return;
  const view = typeof window !== "undefined" ? window : undefined;
  if (view && typeof view.requestIdleCallback === "function") {
    verificationHandle = view.requestIdleCallback(() => {
      flushVerification();
    }, { timeout: 200 }) ;
  } else if (view && typeof view.requestAnimationFrame === "function") {
    verificationHandle = view.requestAnimationFrame(() => {
      flushVerification();
    }) ;
  } else {
    verificationHandle = setTimeout(() => {
      flushVerification();
    }, 0) ;
  }
}

/**
 * Marks the given change keys for deferred re-verification. Undo/redo/revert
 * re-verify the surviving set (their sheet projection changed globally).
 * A plain commit re-verifies the full surviving set as well: a new rule can
 * change cascade/specificity for earlier changes, so verifying only incoming
 * records would drop their conflict warnings.
 */
function markForVerification(
  keys: Iterable<string>,
  verificationTargets?: ReadonlyMap<string, HTMLElement | null>,
): void {
  const selectedElement = getSelectedElement()?.domElement ?? null;
  let added = false;
  for (const key of keys) {
    if (!pendingVerificationTargets.has(key)) added = true;
    // Keep the latest commit context for a merged key. The element may be in
    // an iframe, so this is also the document boundary for verification.
    pendingVerificationTargets.set(key, verificationTargets?.get(key) ?? selectedElement);
  }
  if (added) scheduleVerification();
}

/** Append records and report whether canonical workspace state changed. */
export function appendChanges(incoming: ChangeRecord[], options: AppendChangesOptions = {}): CommitResult {
  const result = workspaceChangeStore.commitChangeRecords(incoming, reapply);
  if (result !== "applied") return result;
  // Re-verify the full surviving set so earlier diagnostics are refreshed at
  // the new revision instead of being orphaned at the old one.
  markForVerification(getChangesSnapshot().map(changeKey), options.verificationTargets);
  return result;
}

export function appendChange(change: ChangeRecord): CommitResult {
  return appendChanges([change]);
}

export function revertChange(change: ChangeRecord): void {
  if (!workspaceChangeStore.revertChangeRecord(change, reapply)) return;
  markForVerification(getChangesSnapshot().map(changeKey));
}

/**
 * Removes source-verified records without allowing older undo snapshots to
 * resurrect their managed previews.
 *
 * Agent handoff revisions identify records by the same stable key used by the
 * canonical change model. Verification can therefore reconcile a subset while
 * preserving newer, unsent edits and their remaining undo history.
 */
export function reconcileVerifiedChanges(verifiedKeys: ReadonlySet<string>): number {
  const removed = reconcileVerifiedWorkspaceChanges(verifiedKeys, new Set());
  if (removed === 0) return 0;
  return removed;
}

/** Atomically reconciles ordinary and structural intent from one agent handoff. */
export function reconcileVerifiedWorkspaceChanges(
  verifiedKeys: ReadonlySet<string>,
  verifiedStructuralIds: ReadonlySet<string>,
): number {
  const removed = workspaceChangeStore.reconcileWorkspaceChanges(
    verifiedKeys,
    verifiedStructuralIds,
    reapply,
  );
  if (removed === 0) return 0;
  pruneStructuralProjectionReports(verifiedStructuralIds);
  markForVerification(getChangesSnapshot().map(changeKey));
  return removed;
}

export function discardChangesForSelector(selector: string): void {
  if (!workspaceChangeStore.discardChangeRecords({ kind: "selector", selector }, reapply)) return;
  markForVerification(getChangesSnapshot().map(changeKey));
}

/** Relink removes every CSS declaration owned by one durable rendered target. */
export function discardChangesForInstanceOverride(overrideId: string): void {
  if (!workspaceChangeStore.discardChangeRecords({ kind: "instance-override", id: overrideId }, reapply)) return;
  markForVerification(getChangesSnapshot().map(changeKey));
}

export function undo(): boolean {
  const undone = workspaceChangeStore.undoWorkspaceChange(reapply);
  if (undone) markForVerification(getChangesSnapshot().map(changeKey));
  return undone;
}

export function redo(): boolean {
  const redone = workspaceChangeStore.redoWorkspaceChange(reapply);
  if (redone) markForVerification(getChangesSnapshot().map(changeKey));
  return redone;
}

/**
 * Replaces ordinary records while preserving structural intent. Restoring any
 * dimension is terminal for the unified workspace timeline, so undo and redo
 * history are reset for both dimensions.
 */
export function restoreChangeRecords(incoming: ChangeRecord[]): void {
  // A restored session replaces the change set and may also switch the active
  // document. Do not let a deferred verification from the previous session
  // inspect a newly loaded record with its old selection context.
  pendingVerificationTargets.clear();
  clearPreviewDiagnostics();
  const workspace = workspaceChangeStore.getSnapshot();
  workspaceChangeStore.restoreWorkspaceChanges(
    { changes: incoming, structuralChanges: workspace.structuralChanges },
    reapply,
  );
}

/** Restores every canonical workspace intent as one subscriber-visible snapshot. */
export function loadWorkspaceChanges(
  incoming: readonly ChangeRecord[],
  structuralChanges: readonly StructuralChange[],
): void {
  pendingVerificationTargets.clear();
  clearPreviewDiagnostics();
  clearStructuralProjectionReports();
  workspaceChangeStore.restoreWorkspaceChanges({ changes: incoming, structuralChanges }, reapply);
}

/** Clears all workspace intent and its unified undo/redo timeline. */
export function clearWorkspace(): void {
  // A pending blur/composition timer must not be able to append a draft after
  // the canonical set has been cleared.
  cancelInlineTextForClear();
  pendingVerificationTargets.clear();
  clearPreviewDiagnostics();
  clearStructuralProjectionReports();
  workspaceChangeStore.clearWorkspaceChanges(reapply);
}

export function getChangesList(): ChangeRecord[] {
  return [...getChangesSnapshot()];
}

export { subscribe as subscribeChanges, getChangesSnapshot as getChanges };

export function useChanges(): ChangeRecord[] {
  return useSyncExternalStore(subscribe, getChangesSnapshot, getChangesSnapshot);
}
