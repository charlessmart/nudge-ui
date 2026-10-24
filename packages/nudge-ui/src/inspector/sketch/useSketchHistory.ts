import { useCallback, useState } from "react";
import {
  EMPTY_SKETCH_HISTORY,
  addSketchStroke,
  eraseSketchStrokes,
  redoSketchEdit,
  transformSketchStroke,
  undoSketchEdit,
  type SketchHistory,
} from "./history.ts";
import type { SketchStroke } from "./model.ts";

export interface SketchHistoryControls {
  readonly history: SketchHistory;
  readonly addStroke: (stroke: SketchStroke) => void;
  readonly eraseStrokes: (ids: readonly string[], gesture: number) => void;
  readonly transformStroke: (stroke: SketchStroke, gesture: number) => void;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly reset: () => void;
}

/** The sketch's strokes and edit history, lifted so the toolbar and the surface read the same state. */
export function useSketchHistory(): SketchHistoryControls {
  const [history, setHistory] = useState<SketchHistory>(EMPTY_SKETCH_HISTORY);

  const addStroke = useCallback((stroke: SketchStroke) => {
    setHistory((current) => addSketchStroke(current, stroke));
  }, []);
  const eraseStrokes = useCallback((ids: readonly string[], gesture: number) => {
    setHistory((current) => eraseSketchStrokes(current, ids, gesture));
  }, []);
  const transformStroke = useCallback((stroke: SketchStroke, gesture: number) => {
    setHistory((current) => transformSketchStroke(current, stroke, gesture));
  }, []);
  const undo = useCallback(() => setHistory(undoSketchEdit), []);
  const redo = useCallback(() => setHistory(redoSketchEdit), []);
  const reset = useCallback(() => setHistory(EMPTY_SKETCH_HISTORY), []);

  return { history, addStroke, eraseStrokes, transformStroke, undo, redo, reset };
}
