import { isAppInUse } from "./viewStore.ts";

/**
 * `select` leaves the application interactive; `design` turns clicks into
 * inspector selection; `debug` is the Inspection tool, which slows the page's animations down, can show Outline view
 * and Explode view on top, and keeps the app interactive. Each is its own tool, so only one is active.
 */
export type CanvasInteractionTool = "select" | "design" | "comment" | "sketch" | "debug";

/** Physical key used to temporarily interact with the app in the canvas. */
export const APP_INTERACTION_KEY = "KeyA";

/** The Inspection tool's views, each switched on and off on its own. */
export type InspectionView = "outlines" | "explode";

/** D picks the Inspection tool; O and X switch its views. X, not E, for Explode: E picks the eraser while sketching. */
export const INSPECTION_SHORTCUTS = {
  tool: { code: "KeyD", label: "D" },
  outlines: { code: "KeyO", label: "O" },
  explode: { code: "KeyX", label: "X" },
} as const;

export function inspectionViewForCode(code: string): InspectionView | null {
  if (code === INSPECTION_SHORTCUTS.outlines.code) return "outlines";
  if (code === INSPECTION_SHORTCUTS.explode.code) return "explode";
  return null;
}

export function canvasToolForCode(code: string): CanvasInteractionTool | null {
  if (code === "KeyV") return "design";
  if (code === "KeyC") return "comment";
  if (code === "KeyP") return "sketch";
  if (code === INSPECTION_SHORTCUTS.tool.code || inspectionViewForCode(code)) return "debug";
  return null;
}

export function canvasToolForEvent(event: KeyboardEvent): CanvasInteractionTool | null {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  return canvasToolForCode(event.code);
}

/**
 * Marks a key the inspector acted on as handled, and keeps it from the page's own shortcuts (GitHub's `c`, say) unless
 * the user is working the app itself. `always` is for the chords that show and hide the inspector, which win in every
 * mode. Handlers run on the window's capture phase, ahead of a page's own key listeners.
 */
export function claimShortcutKey(event: KeyboardEvent, options: { readonly always?: boolean } = {}): void {
  event.preventDefault();
  if (options.always || !isAppInUse()) event.stopPropagation();
}
