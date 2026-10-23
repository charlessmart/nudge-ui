import { describe, expect, it } from "vitest";
import { SKETCH_STROKE_COLOR, SKETCH_STROKE_OUTLINE, isSketchStroke, type SketchStroke } from "./model.ts";

const stroke: SketchStroke = {
  id: "stroke-1",
  kind: "rectangle",
  width: 4,
  color: SKETCH_STROKE_COLOR,
  outlineColor: SKETCH_STROKE_OUTLINE,
  points: [{ x: 10, y: 10 }, { x: 50, y: 10 }],
};

describe("sketch stroke validation", () => {
  it("accepts strokes saved before rotation existed", () => {
    expect(isSketchStroke(stroke)).toBe(true);
  });

  it("accepts a rotated stroke", () => {
    expect(isSketchStroke({ ...stroke, rotation: 0.75 })).toBe(true);
    expect(isSketchStroke({ ...stroke, rotation: -Math.PI })).toBe(true);
  });

  it("rejects a rotation that is not a plausible angle", () => {
    expect(isSketchStroke({ ...stroke, rotation: Number.NaN })).toBe(false);
    expect(isSketchStroke({ ...stroke, rotation: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isSketchStroke({ ...stroke, rotation: 90 })).toBe(false);
    expect(isSketchStroke({ ...stroke, rotation: "0.5" })).toBe(false);
  });
});
