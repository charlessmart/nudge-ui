export type CanvasInteractionTool = "move" | "pan" | "sketch";

export function canvasToolForCode(code: string): CanvasInteractionTool | null {
  if (code === "KeyV") return "move";
  if (code === "KeyH") return "pan";
  if (code === "KeyP") return "sketch";
  return null;
}

export function canvasToolForEvent(event: KeyboardEvent): CanvasInteractionTool | null {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return null;
  return canvasToolForCode(event.code);
}
