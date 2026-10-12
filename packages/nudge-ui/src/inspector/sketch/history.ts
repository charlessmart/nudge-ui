import type { SketchStroke } from "./model.ts";

interface ErasedStroke {
  readonly stroke: SketchStroke;
  /** Position in the stroke list at the moment it was erased. */
  readonly index: number;
}

type SketchHistoryEntry =
  | { readonly kind: "add"; readonly stroke: SketchStroke }
  | { readonly kind: "erase"; readonly gesture: number; readonly erased: readonly ErasedStroke[] };

/** Strokes plus the undo and redo stacks of the edits that produced them. */
export interface SketchHistory {
  readonly strokes: readonly SketchStroke[];
  readonly undo: readonly SketchHistoryEntry[];
  readonly redo: readonly SketchHistoryEntry[];
}

export const EMPTY_SKETCH_HISTORY: SketchHistory = { strokes: [], undo: [], redo: [] };

export function addSketchStroke(history: SketchHistory, stroke: SketchStroke): SketchHistory {
  return {
    strokes: [...history.strokes, stroke],
    undo: [...history.undo, { kind: "add", stroke }],
    redo: [],
  };
}

interface StrokeRemoval {
  readonly strokes: SketchStroke[];
  readonly erased: ErasedStroke[];
}

function removeStrokes(strokes: readonly SketchStroke[], ids: ReadonlySet<string>): StrokeRemoval {
  const remaining: SketchStroke[] = [];
  const erased: ErasedStroke[] = [];
  strokes.forEach((stroke, index) => {
    if (ids.has(stroke.id)) erased.push({ stroke, index: index - erased.length });
    else remaining.push(stroke);
  });
  return { strokes: remaining, erased };
}

/**
 * Erases strokes as one undoable edit. Strokes erased by the same `gesture`
 * share an entry, so one eraser drag undoes in a single step.
 */
export function eraseSketchStrokes(
  history: SketchHistory,
  ids: readonly string[],
  gesture: number,
): SketchHistory {
  const { strokes, erased } = removeStrokes(history.strokes, new Set(ids));
  if (erased.length === 0) return history;
  const last = history.undo.at(-1);
  const undo = last?.kind === "erase" && last.gesture === gesture
    ? [...history.undo.slice(0, -1), { ...last, erased: [...last.erased, ...erased] }]
    : [...history.undo, { kind: "erase" as const, gesture, erased }];
  return { strokes, undo, redo: [] };
}

function restoreErased(strokes: readonly SketchStroke[], erased: readonly ErasedStroke[]): SketchStroke[] {
  const restored = [...strokes];
  // Reinsert in reverse removal order so each recorded index is valid again.
  for (const { stroke, index } of [...erased].reverse()) restored.splice(index, 0, stroke);
  return restored;
}

export function undoSketchEdit(history: SketchHistory): SketchHistory {
  const entry = history.undo.at(-1);
  if (!entry) return history;
  const strokes = entry.kind === "add"
    ? history.strokes.filter((stroke) => stroke.id !== entry.stroke.id)
    : restoreErased(history.strokes, entry.erased);
  return { strokes, undo: history.undo.slice(0, -1), redo: [...history.redo, entry] };
}

export function redoSketchEdit(history: SketchHistory): SketchHistory {
  const entry = history.redo.at(-1);
  if (!entry) return history;
  const strokes = entry.kind === "add"
    ? [...history.strokes, entry.stroke]
    : removeStrokes(history.strokes, new Set(entry.erased.map(({ stroke }) => stroke.id))).strokes;
  return { strokes, undo: [...history.undo, entry], redo: history.redo.slice(0, -1) };
}
