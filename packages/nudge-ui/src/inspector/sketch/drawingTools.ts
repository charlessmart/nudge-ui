import { useSyncExternalStore } from "react";
import { SKETCH_STROKE_COLORS, type SketchStrokeColor } from "./model.ts";

/** Drawing mode chosen from the canvas toolbar while the sketch tool is active. */
export type SketchDrawingTool = "pen" | "eraser" | "rectangle";

export interface SketchDrawingToolsSnapshot {
  readonly tool: SketchDrawingTool;
  readonly color: SketchStrokeColor;
}

const DEFAULT_SNAPSHOT: SketchDrawingToolsSnapshot = {
  tool: "pen",
  color: SKETCH_STROKE_COLORS.at(-1)!,
};

let snapshot = DEFAULT_SNAPSHOT;
const listeners = new Set<() => void>();

function publish(next: SketchDrawingToolsSnapshot): void {
  if (next.tool === snapshot.tool && next.color === snapshot.color) return;
  snapshot = next;
  for (const listener of listeners) listener();
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
export function setSketchStrokeColor(color: SketchStrokeColor): void {
  publish({ tool: snapshot.tool === "eraser" ? "pen" : snapshot.tool, color });
}

/** Every sketch session starts with the pen; the chosen color is kept. */
export function resetSketchDrawingTool(): void {
  setSketchDrawingTool("pen");
}
