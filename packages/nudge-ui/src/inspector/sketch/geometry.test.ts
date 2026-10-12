import { describe, expect, it } from "vitest";
import { findErasedSketchStrokeIds, findSketchElementAt, translateSketchAnnotation, translateSketchStroke } from "./geometry.ts";
import {
  SKETCH_ANNOTATION_RADIUS,
  SKETCH_STROKE_COLOR,
  SKETCH_STROKE_OUTLINE,
  type SketchStroke,
} from "./model.ts";

const stroke: SketchStroke = {
  id: "stroke-1",
  kind: "rectangle" as const,
  width: 6,
  color: SKETCH_STROKE_COLOR,
  outlineColor: SKETCH_STROKE_OUTLINE,
  points: [{ x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 60 }, { x: 20, y: 60 }, { x: 20, y: 20 }],
};

describe("sketch geometry", () => {
  it("hit-tests annotations above strokes and strokes above empty space", () => {
    const annotation = {
      id: "annotation-1",
      number: 1,
      point: { x: 20, y: 20 },
      description: "Corner",
    };

    expect(findSketchElementAt({ x: 20, y: 20 }, [stroke], [annotation])).toEqual({
      kind: "annotation",
      id: "annotation-1",
    });
    expect(findSketchElementAt({ x: 50, y: 20 }, [stroke], [])).toEqual({ kind: "stroke", id: "stroke-1" });
    expect(findSketchElementAt({ x: 50, y: 40 }, [stroke], [])).toEqual({ kind: "stroke", id: "stroke-1" });
    expect(findSketchElementAt({ x: 120, y: 120 }, [stroke], [])).toBeNull();
  });

  it("moves a stroke as one constrained layer", () => {
    const moved = translateSketchStroke(stroke, { x: 30, y: 20 }, { width: 100, height: 100 });
    expect(moved.points).toEqual([
      { x: 40, y: 40 },
      { x: 100, y: 40 },
      { x: 100, y: 80 },
      { x: 40, y: 80 },
      { x: 40, y: 40 },
    ]);
  });

  it("keeps an annotation inside the drawing bounds", () => {
    const annotation = {
      id: "annotation-1",
      number: 1,
      point: { x: 100 - SKETCH_ANNOTATION_RADIUS, y: 100 - SKETCH_ANNOTATION_RADIUS },
      description: "Corner",
    };
    const moved = translateSketchAnnotation(annotation, { x: 40, y: 40 }, { width: 100, height: 100 });
    expect(moved.point).toEqual({ x: 100, y: 100 });
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
