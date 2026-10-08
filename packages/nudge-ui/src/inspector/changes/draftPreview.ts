import { getSelectedElement } from "../selection/selectionStore.ts";
import { changeKey } from "./model.ts";
import { verifyManagedStyleProjection } from "./managedStyleProjection.ts";
import { isPreviewableChange } from "./types.ts";
import {
  beginPreviewAttempt,
  clearPreviewDiagnostics,
  getHostPreviewDocument,
  publishPreviewDiagnostic,
} from "./previewDiagnostics.ts";
import { clearStructuralProjectionReports, pruneStructuralProjectionReports } from "../projection/structuralProjection.ts";
import { applyHostDraftProjection, compileDraftProjection } from "../projection/draftProjection.ts";
import { isEditorShellDocument } from "../runtime/editorShell.ts";
import { isOriginalPreviewActive, subscribeOriginalPreview } from "../shell/originalPreview.ts";
import type { DraftChangesSnapshot, DraftProjectionEvent } from "../drafts/draftStore.ts";

/** The host document's preview of the active draft. */
export interface DraftPreview {
  project(snapshot: DraftChangesSnapshot, event: DraftProjectionEvent): void;
  dispose(): void;
}

/**
 * Projects the active draft into the host document and verifies the managed
 * CSS off the commit path (0044). Verification re-checks the full surviving
 * set: a new rule can change cascade or specificity for earlier changes.
 */
export function createDraftPreview(readActive: () => DraftChangesSnapshot): DraftPreview {
  let pendingTargets = new Map<string, HTMLElement | null>();
  let handle: number | ReturnType<typeof setTimeout> | null = null;

  function reapply(snapshot: DraftChangesSnapshot): void {
    // While hold-to-view-original is active the host document intentionally
    // shows the page without inspector changes. Releasing re-projects.
    if (isOriginalPreviewActive()) return;
    if (!isEditorShellDocument()) applyHostDraftProjection(compileDraftProjection(snapshot));
  }

  function flushVerification(): void {
    handle = null;
    // Probing the original preview would report the held-back changes as
    // conflicts. Keep the pending targets; releasing re-verifies them.
    if (isOriginalPreviewActive()) return;
    const targets = pendingTargets;
    pendingTargets = new Map();
    // The editor shell has no application document. Renderer diagnostics are
    // owned by renderer projection reports.
    if (targets.size === 0 || isEditorShellDocument()) return;
    const current = readActive();
    const attempt = beginPreviewAttempt(getHostPreviewDocument(), current.revision);
    if (!attempt) return;
    for (const change of current.changes) {
      if (!isPreviewableChange(change)) continue;
      const key = changeKey(change);
      if (!targets.has(key)) continue;
      const result = verifyManagedStyleProjection(change, targets.get(key) ?? null);
      if (result) publishPreviewDiagnostic(attempt, key, result);
    }
  }

  function scheduleVerification(): void {
    if (handle !== null) return;
    const view = typeof window !== "undefined" ? window : undefined;
    if (view && typeof view.requestIdleCallback === "function") {
      handle = view.requestIdleCallback(flushVerification, { timeout: 200 });
    } else if (view && typeof view.requestAnimationFrame === "function") {
      handle = view.requestAnimationFrame(flushVerification);
    } else {
      handle = setTimeout(flushVerification, 0);
    }
  }

  function markForVerification(
    snapshot: DraftChangesSnapshot,
    verificationTargets?: ReadonlyMap<string, HTMLElement | null>,
  ): void {
    const selectedElement = getSelectedElement()?.domElement ?? null;
    let added = false;
    for (const key of snapshot.changes.map(changeKey)) {
      if (!pendingTargets.has(key)) added = true;
      // Keep the latest commit context for a merged key. The element may be in
      // an iframe, so this is also the document for verification.
      pendingTargets.set(key, verificationTargets?.get(key) ?? selectedElement);
    }
    if (added) scheduleVerification();
  }

  const stopOriginalPreview = subscribeOriginalPreview(() => {
    if (isEditorShellDocument()) return;
    const snapshot = readActive();
    if (isOriginalPreviewActive()) {
      applyHostDraftProjection({
        sourceRevision: snapshot.revision,
        managedStyles: { rules: [], css: "" },
        instanceOverrides: [],
        structuralChanges: [],
        textContentChanges: [],
        componentOverrides: [],
      });
      return;
    }
    reapply(snapshot);
    // A flush during the hold kept its targets without scheduling, so marking
    // alone would find every key present and schedule nothing.
    markForVerification(snapshot);
    if (pendingTargets.size > 0) scheduleVerification();
  });

  return {
    project(snapshot, event) {
      switch (event.kind) {
        case "edit":
          reapply(snapshot);
          markForVerification(snapshot, event.verificationTargets);
          return;
        case "reconcile":
          reapply(snapshot);
          pruneStructuralProjectionReports(event.structuralIds);
          markForVerification(snapshot);
          return;
        case "switch":
          pendingTargets.clear();
          reapply(snapshot);
          markForVerification(snapshot);
          return;
        case "reset":
          // A deferred verification must not inspect a new record with the
          // selection context of the cleared one.
          pendingTargets.clear();
          clearPreviewDiagnostics();
          clearStructuralProjectionReports();
          reapply(snapshot);
      }
    },
    dispose() {
      stopOriginalPreview();
      pendingTargets.clear();
    },
  };
}
