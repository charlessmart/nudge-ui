import { useSyncExternalStore } from "react";
import {
  captureViewport,
  type CapturedSketch,
  type SketchCaptureOptions,
} from "../../sketch/capture.ts";

export type SketchCaptureState = "idle" | "sketching" | "capturing" | "ready" | "error";

export interface SketchInteractionSnapshot {
  readonly captureState: SketchCaptureState;
  readonly captured: CapturedSketch | null;
  readonly error: string | null;
}

const EMPTY_SNAPSHOT: SketchInteractionSnapshot = {
  captureState: "idle",
  captured: null,
  error: null,
};

let snapshot = EMPTY_SNAPSHOT;
let captureController: AbortController | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A view subscriber must not break the interaction state machine.
    }
  }
}

function publish(next: SketchInteractionSnapshot): void {
  snapshot = next;
  notify();
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
  return snapshot.captureState !== "idle" || snapshot.captured !== null;
}

export function useSketchInteractionActive(): boolean {
  const current = useSketchInteraction();
  return current.captureState !== "idle" || current.captured !== null;
}

export function beginSketchCapture(): void {
  captureController?.abort();
  captureController = null;
  publish({ captureState: "sketching", captured: null, error: null });
}

export function completeSketchCapture(hostElement: HTMLElement, capture: typeof captureViewport = captureViewport): Promise<CapturedSketch> {
  captureController?.abort();
  const controller = new AbortController();
  captureController = controller;
  publish({ captureState: "capturing", captured: null, error: null });
  const options: SketchCaptureOptions = { hostElement, signal: controller.signal };
  return capture(options)
    .then((captured) => {
      if (captureController !== controller) return captured;
      captureController = null;
      publish({ captureState: "ready", captured, error: null });
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
