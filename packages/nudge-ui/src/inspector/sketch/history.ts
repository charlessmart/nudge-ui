import type { SketchStroke } from "./model.ts";

interface ErasedStroke {
  readonly stroke: SketchStroke;
  /** Position in the stroke list at the moment it was erased. */
  readonly index: number;
}

type SketchHistoryEntry =
  | { readonly kind: "add"; readonly stroke: SketchStroke }
  | { readonly kind: "erase"; readonly gesture: number; readonly erased: readonly ErasedStroke[] }
  | { readonly kind: "transform"; readonly gesture: number; readonly before: SketchStroke; readonly after: SketchStroke };

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

/** Strokes erased by the same `gesture` share one undo entry, so an eraser drag undoes in one step. */
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

function replaceStroke(strokes: readonly SketchStroke[], stroke: SketchStroke): SketchStroke[] {
  return strokes.map((existing) => existing.id === stroke.id ? stroke : existing);
}

/** Moving, resizing or rotating a stroke; updates from the same `gesture` collapse into one undo step. */
export function transformSketchStroke(
  history: SketchHistory,
  next: SketchStroke,
  gesture: number,
): SketchHistory {
  const before = history.strokes.find((stroke) => stroke.id === next.id);
  if (!before || before === next) return history;
  const last = history.undo.at(-1);
  const undo = last?.kind === "transform" && last.gesture === gesture && last.after.id === next.id
    ? [...history.undo.slice(0, -1), { ...last, after: next }]
    : [...history.undo, { kind: "transform" as const, gesture, before, after: next }];
  return { strokes: replaceStroke(history.strokes, next), undo, redo: [] };
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
    : entry.kind === "erase"
      ? restoreErased(history.strokes, entry.erased)
      : replaceStroke(history.strokes, entry.before);
  return { strokes, undo: history.undo.slice(0, -1), redo: [...history.redo, entry] };
}

export function redoSketchEdit(history: SketchHistory): SketchHistory {
  const entry = history.redo.at(-1);
  if (!entry) return history;
  const strokes = entry.kind === "add"
    ? [...history.strokes, entry.stroke]
    : entry.kind === "erase"
      ? removeStrokes(history.strokes, new Set(entry.erased.map(({ stroke }) => stroke.id))).strokes
      : replaceStroke(history.strokes, entry.after);
  return { strokes, undo: [...history.undo, entry], redo: history.redo.slice(0, -1) };
}
