import { useSyncExternalStore } from "react";
import {
  captureViewport,
  type CapturedSketch,
  type SketchCaptureOptions,
} from "./capture.ts";

export type SketchCaptureState = "idle" | "sketching" | "capturing" | "ready" | "error";

export interface SketchInteractionSnapshot {
  readonly captureState: SketchCaptureState;
  readonly captured: CapturedSketch | null;
  readonly editingId: string | null;
  readonly error: string | null;
}

const EMPTY_SNAPSHOT: SketchInteractionSnapshot = {
  captureState: "idle",
  captured: null,
  editingId: null,
  error: null,
};

let snapshot = EMPTY_SNAPSHOT;
let captureController: AbortController | null = null;
const listeners = new Set<() => void>();

function publish(next: SketchInteractionSnapshot): void {
  snapshot = next;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A view subscriber must not break the interaction state machine.
    }
  }
}

export function getSketchInteractionSnapshot(): SketchInteractionSnapshot {
  return snapshot;
}

export function subscribeSketchInteraction(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSketchInteraction(): SketchInteractionSnapshot {
  return useSyncExternalStore(
    subscribeSketchInteraction,
    getSketchInteractionSnapshot,
    getSketchInteractionSnapshot,
  );
}

export function isSketchInteractionActive(): boolean {
  return snapshot.captureState !== "idle" || snapshot.captured !== null || snapshot.editingId !== null;
}

export function useSketchInteractionActive(): boolean {
  const current = useSketchInteraction();
  return current.captureState !== "idle" || current.captured !== null || current.editingId !== null;
}

export function beginSketchCapture(): void {
  captureController?.abort();
  captureController = null;
  publish({ captureState: "sketching", captured: null, editingId: null, error: null });
}

export function completeSketchCapture(hostElement: HTMLElement): Promise<CapturedSketch> {
  captureController?.abort();
  const controller = new AbortController();
  captureController = controller;
  publish({ captureState: "capturing", captured: null, editingId: null, error: null });
  const options: SketchCaptureOptions = { hostElement, signal: controller.signal, method: "dom" };
  return captureViewport(options)
    .then((captured) => {
      if (captureController !== controller) return captured;
      captureController = null;
      publish({ captureState: "ready", captured, editingId: null, error: null });
      return captured;
    })
    .catch((error: unknown) => {
      if (captureController !== controller) throw error;
      captureController = null;
      if (controller.signal.aborted) {
        publish(EMPTY_SNAPSHOT);
        throw error;
      }
      publish({
        captureState: "error",
        captured: null,
        editingId: null,
        error: error instanceof Error ? error.message : "The viewport could not be captured.",
      });
      throw error;
    });
}

export function cancelSketchInteraction(): void {
  captureController?.abort();
  captureController = null;
  publish(EMPTY_SNAPSHOT);
}

export function openSketchEditor(sketchId: string): void {
  captureController?.abort();
  captureController = null;
  publish({ captureState: "idle", captured: null, editingId: sketchId, error: null });
}

export function closeSketchEditor(): void {
  if (snapshot.captureState !== "ready" && snapshot.editingId === null) return;
  publish(EMPTY_SNAPSHOT);
}

export function resetSketchInteraction(): void {
  captureController?.abort();
  captureController = null;
  snapshot = EMPTY_SNAPSHOT;
}
