import { useSyncExternalStore } from "react";

/**
 * Whether the sketch tool is open. Marks outlive it (they live in the marks store), so the only state anything outside
 * this module needs is "open or not".
 */
let active = false;
/** Whether the open sketch came from its keyboard shortcut, which skips the bar's intro. */
let openedByKeyboard = false;
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

export function sketchOpenedByKeyboard(): boolean {
  return openedByKeyboard;
}

/** `viaKeyboard` only counts when this opens the sketch; an open one keeps how it was opened. */
export function openSketchInteraction({ viaKeyboard = false }: { readonly viaKeyboard?: boolean } = {}): void {
  if (!active) openedByKeyboard = viaKeyboard;
  setActive(true);
}

export function cancelSketchInteraction(): void {
  setActive(false);
}
