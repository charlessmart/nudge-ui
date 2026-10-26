import { describe, expect, it } from "vitest";
import { findErasedSketchStrokeIds, findSketchElementAt } from "./geometry.ts";
import { SKETCH_STROKE_COLOR, type SketchStroke } from "./model.ts";

const stroke: SketchStroke = {
  id: "stroke-1",
  kind: "rectangle",
  width: 6,
  color: SKETCH_STROKE_COLOR,
  points: [{ x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 60 }, { x: 20, y: 60 }, { x: 20, y: 20 }],
};

describe("sketch geometry", () => {
  it("hit-tests strokes above empty space", () => {
    expect(findSketchElementAt({ x: 50, y: 20 }, [stroke])).toBe("stroke-1");
    expect(findSketchElementAt({ x: 50, y: 40 }, [stroke])).toBe("stroke-1");
    expect(findSketchElementAt({ x: 120, y: 120 }, [stroke])).toBeNull();
  });

  it("erases strokes crossed by the eraser path, including fast drags between samples", () => {
    const line: SketchStroke = {
      ...stroke,
      id: "line-1",
      kind: "freehand",
      points: [{ x: 200, y: 0 }, { x: 200, y: 100 }],
    };

    expect(findErasedSketchStrokeIds({ x: 150, y: 50 }, { x: 250, y: 50 }, [stroke, line], 4)).toEqual(["line-1"]);
    expect(findErasedSketchStrokeIds({ x: 10, y: 40 }, { x: 30, y: 40 }, [stroke, line], 4)).toEqual(["stroke-1"]);
    expect(findErasedSketchStrokeIds({ x: 40, y: 40 }, { x: 60, y: 40 }, [stroke, line], 4)).toEqual([]);
  });
});
