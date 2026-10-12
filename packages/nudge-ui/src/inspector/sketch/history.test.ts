import { describe, expect, it } from "vitest";
import {
  EMPTY_SKETCH_HISTORY,
  addSketchStroke,
  eraseSketchStrokes,
  redoSketchEdit,
  undoSketchEdit,
  type SketchHistory,
} from "./history.ts";
import { SKETCH_STROKE_COLOR, SKETCH_STROKE_OUTLINE, type SketchStroke } from "./model.ts";

function stroke(id: string): SketchStroke {
  return {
    id,
    width: 6,
    color: SKETCH_STROKE_COLOR,
    outlineColor: SKETCH_STROKE_OUTLINE,
    points: [{ x: 0, y: 0 }, { x: 10, y: 10 }],
  };
}

function ids(history: SketchHistory): string[] {
  return history.strokes.map((item) => item.id);
}

function drawn(...strokeIds: string[]): SketchHistory {
  return strokeIds.reduce((history, id) => addSketchStroke(history, stroke(id)), EMPTY_SKETCH_HISTORY);
}

describe("sketch history", () => {
  it("undoes an erase instead of removing an earlier stroke", () => {
    const erased = eraseSketchStrokes(drawn("a", "b"), ["b"], 1);

    expect(ids(erased)).toEqual(["a"]);
    expect(ids(undoSketchEdit(erased))).toEqual(["a", "b"]);
    expect(ids(undoSketchEdit(undoSketchEdit(erased)))).toEqual(["a"]);
  });

  it("restores erased strokes at their original positions", () => {
    const erased = eraseSketchStrokes(drawn("a", "b", "c", "d"), ["a", "c"], 1);

    expect(ids(erased)).toEqual(["b", "d"]);
    expect(ids(undoSketchEdit(erased))).toEqual(["a", "b", "c", "d"]);
  });

  it("undoes one eraser drag in a single step", () => {
    let history = drawn("a", "b", "c");
    history = eraseSketchStrokes(history, ["a"], 1);
    history = eraseSketchStrokes(history, ["c"], 2);
    history = eraseSketchStrokes(history, ["b"], 2);

    expect(ids(history)).toEqual([]);
    expect(ids(undoSketchEdit(history))).toEqual(["b", "c"]);
    expect(ids(undoSketchEdit(undoSketchEdit(history)))).toEqual(["a", "b", "c"]);
  });

  it("ignores an erase that touches nothing", () => {
    const history = drawn("a");

    expect(eraseSketchStrokes(history, [], 1)).toBe(history);
    expect(eraseSketchStrokes(history, ["missing"], 1)).toBe(history);
  });

  it("clears redo when a stroke is erased", () => {
    const undone = undoSketchEdit(drawn("a", "b"));
    const erased = eraseSketchStrokes(undone, ["a"], 1);

    expect(erased.redo).toEqual([]);
    expect(ids(redoSketchEdit(erased))).toEqual([]);
  });

  it("clears redo when a stroke is drawn", () => {
    const history = addSketchStroke(undoSketchEdit(drawn("a")), stroke("b"));

    expect(ids(redoSketchEdit(history))).toEqual(["b"]);
  });

  it("redoes adds and erases in order", () => {
    const history = eraseSketchStrokes(drawn("a", "b"), ["a"], 1);
    const rewound = undoSketchEdit(undoSketchEdit(undoSketchEdit(history)));

    expect(ids(rewound)).toEqual([]);
    expect(ids(redoSketchEdit(rewound))).toEqual(["a"]);
    expect(ids(redoSketchEdit(redoSketchEdit(rewound)))).toEqual(["a", "b"]);
    expect(ids(redoSketchEdit(redoSketchEdit(redoSketchEdit(rewound))))).toEqual(["b"]);
  });

  it("does nothing when there is nothing to undo or redo", () => {
    expect(undoSketchEdit(EMPTY_SKETCH_HISTORY)).toBe(EMPTY_SKETCH_HISTORY);
    expect(redoSketchEdit(EMPTY_SKETCH_HISTORY)).toBe(EMPTY_SKETCH_HISTORY);
  });
});
