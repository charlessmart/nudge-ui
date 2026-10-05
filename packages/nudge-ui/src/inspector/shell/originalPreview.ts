import { useSyncExternalStore } from "react";
import { draftChangeStore } from "../changes/draftChanges.ts";
import {
  applyHostDraftProjection,
  compileDraftProjection,
} from "../projection/draftProjection.ts";
import { isEditorShellDocument } from "../runtime/editorShell.ts";

let previewingOriginal = false;
const listeners = new Set<() => void>();

export function isOriginalPreviewActive(): boolean {
  return previewingOriginal;
}

export function subscribeOriginalPreview(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useOriginalPreviewActive(): boolean {
  return useSyncExternalStore(
    subscribeOriginalPreview,
    () => previewingOriginal,
    () => false,
  );
}

function notifyOriginalPreviewListeners(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* Subscriber errors must not break the preview toggle. */
    }
  }
}

function applyEmptyHostProjection(): void {
  if (isEditorShellDocument()) return;
  const { revision } = draftChangeStore.getSnapshot();
  applyHostDraftProjection({
    sourceRevision: revision,
    managedStyles: { rules: [], css: "" },
    instanceOverrides: [],
    structuralChanges: [],
    textContentChanges: [],
    componentOverrides: [],
  });
}

function applyCanonicalHostProjection(): void {
  if (isEditorShellDocument()) return;
  applyHostDraftProjection(
    compileDraftProjection(draftChangeStore.getSnapshot()),
  );
}

/**
 * Hold-to-view-original (NUD-30). While active the host document shows the
 * page without any inspector changes. Canonical intent stays in the workspace
 * store, so releasing restores the edited preview without loss.
 */
export function setOriginalPreviewActive(next: boolean): void {
  if (next === previewingOriginal) return;
  previewingOriginal = next;
  if (previewingOriginal) applyEmptyHostProjection();
  else applyCanonicalHostProjection();
  notifyOriginalPreviewListeners();
}
