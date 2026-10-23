import { useSyncExternalStore } from "react";

/** What the sketch toolbar needs from the live drawing surface, which owns the strokes. */
export interface LiveSketchControls {
  readonly hasContent: boolean;
  readonly saving: boolean;
  readonly copy: () => void;
}

const IDLE: LiveSketchControls = {
  hasContent: false,
  saving: false,
  copy: () => undefined,
};

let controls = IDLE;
const listeners = new Set<() => void>();

export function getLiveSketchControls(): LiveSketchControls {
  return controls;
}

export function subscribeLiveSketchControls(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Pass `null` when the drawing surface closes so a stale button cannot act on a sketch that is gone. */
export function publishLiveSketchControls(next: LiveSketchControls | null): void {
  controls = next ?? IDLE;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // One subscriber failing must not stop the toolbar from seeing the new state.
    }
  }
}

export function useLiveSketchControls(): LiveSketchControls {
  return useSyncExternalStore(subscribeLiveSketchControls, getLiveSketchControls, getLiveSketchControls);
}
