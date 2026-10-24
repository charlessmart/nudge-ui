import { describe, expect, it } from "vitest";
import {
  EMPTY_SKETCH_HISTORY,
  addSketchStroke,
  eraseSketchStrokes,
  redoSketchEdit,
  transformSketchStroke,
  undoSketchEdit,
  type SketchHistory,
} from "./history.ts";
import { SKETCH_STROKE_COLOR, type SketchStroke } from "./model.ts";

function stroke(id: string): SketchStroke {
  return {
    id,
    kind: "freehand",
    width: 6,
    color: SKETCH_STROKE_COLOR,
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

  describe("transforms", () => {
    function shifted(history: SketchHistory, id: string, dx: number): SketchStroke {
      const base = history.strokes.find((item) => item.id === id)!;
      return { ...base, points: base.points.map((point) => ({ x: point.x + dx, y: point.y })) };
    }

    function xOf(history: SketchHistory, id: string): number {
      return history.strokes.find((item) => item.id === id)!.points[0]!.x;
    }

    it("undoes and redoes a transform without touching other strokes", () => {
      const start = drawn("a", "b");
      const moved = transformSketchStroke(start, shifted(start, "a", 40), 1);

      expect(xOf(moved, "a")).toBe(40);
      expect(xOf(moved, "b")).toBe(0);
      expect(xOf(undoSketchEdit(moved), "a")).toBe(0);
      expect(xOf(redoSketchEdit(undoSketchEdit(moved)), "a")).toBe(40);
      expect(ids(moved)).toEqual(["a", "b"]);
    });

    it("collapses one drag into a single undo step", () => {
      let history = drawn("a");
      history = transformSketchStroke(history, shifted(history, "a", 10), 7);
      history = transformSketchStroke(history, shifted(history, "a", 10), 7);
      history = transformSketchStroke(history, shifted(history, "a", 10), 7);

      expect(xOf(history, "a")).toBe(30);
      expect(history.undo).toHaveLength(2);
      expect(xOf(undoSketchEdit(history), "a")).toBe(0);
      expect(ids(undoSketchEdit(undoSketchEdit(history)))).toEqual([]);
    });

    it("keeps separate drags as separate undo steps", () => {
      let history = drawn("a");
      history = transformSketchStroke(history, shifted(history, "a", 10), 1);
      history = transformSketchStroke(history, shifted(history, "a", 10), 2);

      expect(xOf(undoSketchEdit(history), "a")).toBe(10);
    });

    it("clears redo and ignores strokes that no longer exist", () => {
      const start = drawn("a", "b");
      const undone = undoSketchEdit(start);
      const moved = transformSketchStroke(undone, shifted(undone, "a", 5), 1);

      expect(moved.redo).toEqual([]);
      expect(transformSketchStroke(start, { ...stroke("missing") }, 1)).toBe(start);
    });

    it("restores an erased stroke in the position it was erased from", () => {
      let history = drawn("a");
      history = transformSketchStroke(history, shifted(history, "a", 25), 1);
      history = eraseSketchStrokes(history, ["a"], 2);

      expect(xOf(undoSketchEdit(history), "a")).toBe(25);
    });
  });
});
