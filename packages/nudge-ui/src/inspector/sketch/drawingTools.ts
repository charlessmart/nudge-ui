import { useSyncExternalStore } from "react";
import { SKETCH_PEN_COLORS, SKETCH_STROKE_COLOR, type SketchPenColor } from "./model.ts";

export type SketchDrawingTool = "pen" | "eraser" | "rectangle" | "text";

export interface SketchDrawingToolsSnapshot {
  readonly tool: SketchDrawingTool;
  readonly color: SketchPenColor;
}

const DEFAULT_COLOR = SKETCH_PEN_COLORS.find((color) => color.value === SKETCH_STROKE_COLOR) ?? SKETCH_PEN_COLORS[0];

const DEFAULT_SNAPSHOT: SketchDrawingToolsSnapshot = {
  tool: "pen",
  color: DEFAULT_COLOR,
};

let snapshot = DEFAULT_SNAPSHOT;
const listeners = new Set<() => void>();

function publish(next: SketchDrawingToolsSnapshot): void {
  if (next.tool === snapshot.tool && next.color === snapshot.color) return;
  snapshot = next;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A view subscriber must not stop the others from seeing the new tool.
    }
  }
}

export function getSketchDrawingTools(): SketchDrawingToolsSnapshot {
  return snapshot;
}

export function subscribeSketchDrawingTools(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useSketchDrawingTools(): SketchDrawingToolsSnapshot {
  return useSyncExternalStore(subscribeSketchDrawingTools, getSketchDrawingTools, getSketchDrawingTools);
}

export function setSketchDrawingTool(tool: SketchDrawingTool): void {
  publish({ ...snapshot, tool });
}

/** Choosing a color implies drawing with it, so the eraser hands back to the pen. */
export function setSketchStrokeColor(color: SketchPenColor): void {
  publish({ tool: snapshot.tool === "eraser" ? "pen" : snapshot.tool, color });
}

/** Resets the tool only; the chosen color is kept. */
export function resetSketchDrawingTool(): void {
  setSketchDrawingTool("pen");
}
