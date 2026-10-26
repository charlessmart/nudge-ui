import { useSyncExternalStore } from "react";
import { captureViewport, type CapturedSketch, type SketchCaptureOptions } from "../../sketch/capture.ts";

/**
 * Whether the sketch tool is open. The tool has one mode — drawing over the live frame — so the only state anything
 * outside this module needs is "open or not"; the capture result goes straight back to the caller.
 */
let active = false;
let captureController: AbortController | null = null;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A view subscriber must not break the interaction state.
    }
  }
}

function setActive(next: boolean): void {
  if (active === next) return;
  active = next;
  notify();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isSketchInteractionActive(): boolean {
  return active;
}

export function useSketchInteractionActive(): boolean {
  return useSyncExternalStore(subscribe, isSketchInteractionActive, isSketchInteractionActive);
}

export function beginSketchCapture(): void {
  captureController?.abort();
  captureController = null;
  setActive(true);
}

export function completeSketchCapture(
  hostElement: HTMLElement,
  capture: typeof captureViewport = captureViewport,
): Promise<CapturedSketch> {
  captureController?.abort();
  const controller = new AbortController();
  captureController = controller;
  const options: SketchCaptureOptions = { hostElement, signal: controller.signal };
  return capture(options).then(
    (captured) => {
      if (captureController === controller) captureController = null;
      return captured;
    },
    (error: unknown) => {
      // A superseded capture was aborted by whoever replaced it, which already owns the open state.
      if (captureController !== controller) throw error;
      captureController = null;
      if (controller.signal.aborted) setActive(false);
      throw error;
    },
  );
}

export function cancelSketchInteraction(): void {
  captureController?.abort();
  captureController = null;
  setActive(false);
}
