import { isEditableEvent } from "../../shell/shortcuts.ts";
import type { SketchDrawingTool } from "../../sketch/drawingTools.ts";

/** Single-key shortcuts for the tools, shown in their tooltips. Circle is O and arrow is L, for line. Once the sketch is open, O and P are the sketch bar's: outside it O switches the Inspection outlines on and P opens the sketch tool. */
export const SKETCH_TOOL_SHORTCUTS = { pen: "P", eraser: "E", rectangle: "R", ellipse: "O", arrow: "L", text: "T" } as const;

const SKETCH_TOOL_CODES: Readonly<Record<string, SketchDrawingTool>> = {
  KeyP: "pen",
  KeyE: "eraser",
  KeyR: "rectangle",
  KeyO: "ellipse",
  KeyL: "arrow",
  KeyT: "text",
};

/** The tool a plain key press picks, unless the press is a modifier chord or is meant for a text field. */
export function sketchToolForEvent(event: KeyboardEvent): SketchDrawingTool | null {
  if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || isEditableEvent(event)) return null;
  return SKETCH_TOOL_CODES[event.code] ?? null;
}
