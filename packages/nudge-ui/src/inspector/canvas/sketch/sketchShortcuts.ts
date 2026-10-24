import { isEditableEvent } from "../../shell/shortcuts.ts";
import type { SketchDrawingTool } from "../../sketch/drawingTools.ts";

/** Single-key shortcuts for the tools, shown in their tooltips. P also opens the sketch tool from the canvas; once it is open, P picks the pen. */
export const SKETCH_TOOL_SHORTCUTS = { pen: "P", eraser: "E", rectangle: "R", text: "T" } as const;

const SKETCH_TOOL_CODES: Readonly<Record<string, SketchDrawingTool>> = {
  KeyP: "pen",
  KeyE: "eraser",
  KeyR: "rectangle",
  KeyT: "text",
};

/** The tool a plain key press picks, unless the press is a modifier chord or is meant for a text field. */
export function sketchToolForEvent(event: KeyboardEvent): SketchDrawingTool | null {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isEditableEvent(event)) return null;
  return SKETCH_TOOL_CODES[event.code] ?? null;
}
