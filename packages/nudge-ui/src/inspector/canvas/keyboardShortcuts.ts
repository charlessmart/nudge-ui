/** `select` leaves the application interactive; `design` turns clicks into inspector selection. */
export type CanvasInteractionTool = "select" | "design" | "comment" | "sketch";

export function canvasToolForCode(code: string): CanvasInteractionTool | null {
  if (code === "KeyI") return "select";
  if (code === "KeyV") return "design";
  if (code === "KeyC") return "comment";
  if (code === "KeyP") return "sketch";
  return null;
}

export function canvasToolForEvent(event: KeyboardEvent): CanvasInteractionTool | null {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  return canvasToolForCode(event.code);
}
