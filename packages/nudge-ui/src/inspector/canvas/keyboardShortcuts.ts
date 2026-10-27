import type { DebugViewMode } from "./debugViewStore.ts";

/**
 * `select` leaves the application interactive; `design` turns clicks into
 * inspector selection; `debug` applies the chosen view: Animation selects elements and steps through their
 * animations, while Outline view and Explode view keep the app interactive. Each is its own tool, so only one is active.
 */
export type CanvasInteractionTool = "select" | "design" | "comment" | "sketch" | "debug";

/** Physical key used to temporarily interact with the app in the canvas. */
export const APP_INTERACTION_KEY = "KeyA";

/** One key per view, so each can be reached directly. X, not E, for Explode: E picks the eraser while sketching. */
export const VIEW_MODE_SHORTCUTS: Readonly<Record<DebugViewMode, { readonly code: string; readonly label: string }>> = {
  animation: { code: "KeyD", label: "D" },
  outlines: { code: "KeyO", label: "O" },
  explode: { code: "KeyX", label: "X" },
};

export function viewModeForCode(code: string): DebugViewMode | null {
  if (code === VIEW_MODE_SHORTCUTS.animation.code) return "animation";
  if (code === VIEW_MODE_SHORTCUTS.outlines.code) return "outlines";
  if (code === VIEW_MODE_SHORTCUTS.explode.code) return "explode";
  return null;
}

export function canvasToolForCode(code: string): CanvasInteractionTool | null {
  if (code === "KeyV") return "design";
  if (code === "KeyC") return "comment";
  if (code === "KeyP") return "sketch";
  if (viewModeForCode(code)) return "debug";
  return null;
}

export function canvasToolForEvent(event: KeyboardEvent): CanvasInteractionTool | null {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  return canvasToolForCode(event.code);
}
