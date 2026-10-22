/**
 * `select` leaves the application interactive; `design` turns clicks into
 * inspector selection; `debug` keeps the app interactive while Outline view or Explode view applies;
 * `animation` selects elements and steps through their animations. Each is its own tool, so only one is active.
 */
export type CanvasInteractionTool = "select" | "design" | "comment" | "sketch" | "debug" | "animation";

/** Physical key used to temporarily interact with the app in the canvas. */
export const APP_INTERACTION_KEY = "KeyA";

export function canvasToolForCode(code: string): CanvasInteractionTool | null {
  if (code === "KeyV") return "design";
  if (code === "KeyC") return "comment";
  if (code === "KeyP") return "sketch";
  if (code === "KeyD") return "debug";
  return null;
}

export function canvasToolForEvent(event: KeyboardEvent): CanvasInteractionTool | null {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  return canvasToolForCode(event.code);
}
