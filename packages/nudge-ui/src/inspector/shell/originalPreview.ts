import { useSyncExternalStore } from "react";

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

/**
 * Hold-to-view-original (NUD-30). While active the host document shows the
 * page without any inspector changes; the draft preview owns that projection.
 * Canonical intent stays in the workspace, so releasing restores the edited
 * preview without loss.
 */
export function setOriginalPreviewActive(next: boolean): void {
  if (next === previewingOriginal) return;
  previewingOriginal = next;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* Subscriber errors must not break the preview toggle. */
    }
  }
}
