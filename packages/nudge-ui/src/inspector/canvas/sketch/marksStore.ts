import { useCallback, useSyncExternalStore } from "react";
import {
  EMPTY_SKETCH_HISTORY,
  addSketchStroke,
  eraseSketchStrokes,
  redoSketchEdit,
  transformSketchStroke,
  undoSketchEdit,
  type SketchHistory,
} from "../../sketch/history.ts";
import type { SketchStroke } from "../../sketch/model.ts";

/**
 * Marks drawn with the sketch tool, one edit history per frame and page. They stay on screen until the user clears
 * them, whichever tool is active, and last as long as the page that hosts the inspector.
 */
const marks = new Map<string, SketchHistory>();
let version = 0;
/** The frame the sketch tool is drawing on; its marks are drawn by the sketch surface instead. */
let editingKey: string | null = null;
/** While a screenshot is taken every frame shows its marks, since the sketch surface is hidden. */
let capturing = false;
/** Clearing is undoable per frame; a gesture of its own keeps it from merging with an eraser drag. */
let clearGesture = -1;
let movable = false;
let selectedMark: SelectedSketchMark | null = null;
/** Far from the sketch surface's gestures (counting up from 1) and clearing's (down from -1), so undo steps never merge. */
const MARK_GESTURE_BASE = 1_000_000_000;
let markGesture = MARK_GESTURE_BASE;
const listeners = new Set<() => void>();

export interface SelectedSketchMark {
  readonly key: string;
  readonly id: string;
}

function notify(): void {
  version += 1;
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // A view subscriber must not stop the others from updating.
    }
  }
}

/** A frame's marks belong to the page it showed when they were drawn; navigating away hides them until it comes back. */
export function sketchMarksKey(cardId: string, url: string): string {
  return `${cardId}\n${url}`;
}

export function subscribeSketchMarks(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getVersion(): number {
  return version;
}

/** Re-renders whenever any frame's marks, the edited frame, or the capture state changes. */
export function useSketchMarksVersion(): number {
  return useSyncExternalStore(subscribeSketchMarks, getVersion, getVersion);
}

export function getSketchMarks(key: string | null): SketchHistory {
  return (key && marks.get(key)) || EMPTY_SKETCH_HISTORY;
}

export function hasSketchMarks(): boolean {
  for (const history of marks.values()) {
    if (history.strokes.length > 0) return true;
  }
  return false;
}

function update(key: string, edit: (history: SketchHistory) => SketchHistory): void {
  const current = getSketchMarks(key);
  const next = edit(current);
  if (next === current) return;
  marks.set(key, next);
  notify();
}

export function setSketchEditingKey(key: string | null): void {
  if (editingKey === key) return;
  editingKey = key;
  notify();
}

/** Whether a frame's marks are drawn by the passive layer rather than the sketch surface. */
export function showsPassiveMarks(key: string): boolean {
  return capturing || key !== editingKey;
}

export function setSketchMarksCapturing(next: boolean): void {
  if (capturing === next) return;
  capturing = next;
  notify();
}

export function sketchMarksMovable(): boolean {
  return movable;
}

/** Set while the Select tool is active and the sketch tool is closed; turning it off puts any picked-up mark down. */
export function setSketchMarksMovable(next: boolean): void {
  if (movable === next) return;
  movable = next;
  if (!next) selectedMark = null;
  notify();
}

export function useSelectedSketchMark(): SelectedSketchMark | null {
  useSketchMarksVersion();
  return selectedMark;
}

export function selectSketchMark(next: SelectedSketchMark | null): void {
  if (selectedMark?.key === next?.key && selectedMark?.id === next?.id) return;
  selectedMark = next;
  notify();
}

/** A new undo step for one Select-tool edit; every update in a drag passes the same number. */
export function nextMarkGesture(): number {
  markGesture += 1;
  return markGesture;
}

export function transformSketchMark(key: string, stroke: SketchStroke, gesture: number): void {
  update(key, (history) => transformSketchStroke(history, stroke, gesture));
}

export function undoSketchMarks(key: string): void {
  update(key, undoSketchEdit);
}

export function redoSketchMarks(key: string): void {
  update(key, redoSketchEdit);
}

/** The mark stays picked up, so undo brings it back with its frame. */
export function deleteSelectedSketchMark(): boolean {
  const mark = selectedMark;
  if (!mark) return false;
  const before = getSketchMarks(mark.key);
  update(mark.key, (history) => eraseSketchStrokes(history, [mark.id], nextMarkGesture()));
  return getSketchMarks(mark.key) !== before;
}

/** Clears every frame's marks. Each frame can bring its own back with undo. */
export function clearAllSketchMarks(): void {
  selectedMark = null;
  clearGesture -= 1;
  let changed = false;
  for (const [key, history] of marks) {
    if (history.strokes.length === 0) continue;
    marks.set(key, eraseSketchStrokes(history, history.strokes.map((stroke) => stroke.id), clearGesture));
    changed = true;
  }
  if (changed) notify();
}

/** Test seam, and the canvas reset: drops every mark and its history. */
export function resetSketchMarks(): void {
  marks.clear();
  editingKey = null;
  capturing = false;
  selectedMark = null;
  notify();
}

export interface SketchMarksControls {
  readonly history: SketchHistory;
  readonly addStroke: (stroke: SketchStroke) => void;
  readonly eraseStrokes: (ids: readonly string[], gesture: number) => void;
  readonly transformStroke: (stroke: SketchStroke, gesture: number) => void;
  readonly undo: () => void;
  readonly redo: () => void;
}

/** One frame's marks and their edit history, for the sketch surface and its shortcuts. */
export function useSketchMarks(key: string | null): SketchMarksControls {
  useSketchMarksVersion();
  const addStroke = useCallback((stroke: SketchStroke) => {
    if (key) update(key, (history) => addSketchStroke(history, stroke));
  }, [key]);
  const eraseStrokes = useCallback((ids: readonly string[], gesture: number) => {
    if (key) update(key, (history) => eraseSketchStrokes(history, ids, gesture));
  }, [key]);
  const transformStroke = useCallback((stroke: SketchStroke, gesture: number) => {
    if (key) transformSketchMark(key, stroke, gesture);
  }, [key]);
  const undo = useCallback(() => {
    if (key) undoSketchMarks(key);
  }, [key]);
  const redo = useCallback(() => {
    if (key) redoSketchMarks(key);
  }, [key]);
  return { history: getSketchMarks(key), addStroke, eraseStrokes, transformStroke, undo, redo };
}
