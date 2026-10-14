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

/** While active the document shows the page without inspector changes; canonical intent is never cleared. */
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
