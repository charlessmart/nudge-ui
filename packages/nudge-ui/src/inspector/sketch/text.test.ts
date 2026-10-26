import { describe, expect, it } from "vitest";
import {
  SKETCH_STROKE_COLOR,
  SKETCH_TEXT_FONT_SIZE,
  SKETCH_TEXT_LINE_HEIGHT,
} from "./model.ts";
import { findErasedSketchStrokeIds, findSketchElementAt } from "./geometry.ts";
import { resizeStroke, rotateStroke, strokeFrame, type SketchRegion } from "./selectionFrame.ts";
import { createTextStroke, fitTextStroke, measureSketchText, retypeTextStroke, sketchTextLines } from "./text.ts";

const REGION: SketchRegion = { minX: 0, minY: 0, maxX: 400, maxY: 300 };

function label(text = "Tighten spacing") {
  return createTextStroke({ id: "text-1", corner: { x: 100, y: 100 }, text, color: SKETCH_STROKE_COLOR });
}

describe("sketch text layers", () => {
  it("measures every line and stacks them at the line height", () => {
    const single = measureSketchText("Hello", 20);
    const double = measureSketchText("Hello\nHi", 20);

    expect(single.height).toBeCloseTo(20 * SKETCH_TEXT_LINE_HEIGHT);
    expect(double.height).toBeCloseTo(2 * 20 * SKETCH_TEXT_LINE_HEIGHT);
    expect(double.width).toBeCloseTo(single.width);
    expect(sketchTextLines("a\n\nb")).toEqual(["a", "", "b"]);
  });

  it("builds a closed box anchored at its top-left corner", () => {
    const layer = label();
    const metrics = measureSketchText("Tighten spacing", SKETCH_TEXT_FONT_SIZE);

    expect(layer.kind).toBe("text");
    expect(layer.points[0]).toEqual({ x: 100, y: 100 });
    expect(layer.points).toHaveLength(5);
    expect(layer.points[0]).toEqual(layer.points[4]);
    expect(layer.points[2]).toEqual({ x: 100 + metrics.width, y: 100 + metrics.height });
    expect(layer.text).toBe("Tighten spacing");
    expect(layer.fontSize).toBe(SKETCH_TEXT_FONT_SIZE);
    expect(layer.rotation).toBeUndefined();
  });

  it("places a rotated box around its corner and records the angle", () => {
    const layer = createTextStroke({ id: "t", corner: { x: 100, y: 100 }, rotation: Math.PI / 2, text: "Hi", color: SKETCH_STROKE_COLOR });
    const { width, height } = measureSketchText("Hi", SKETCH_TEXT_FONT_SIZE);

    expect(layer.rotation).toBeCloseTo(Math.PI / 2);
    expect(layer.points[1]!.x).toBeCloseTo(100);
    expect(layer.points[1]!.y).toBeCloseTo(100 + width);
    expect(layer.points[3]!.x).toBeCloseTo(100 - height);
    expect(strokeFrame(layer).width).toBeCloseTo(width);
    expect(strokeFrame(layer).height).toBeCloseTo(height);
  });

  it("retypes a layer in place, keeping its corner, angle, size and color", () => {
    const turned = rotateStroke(label(), { x: 150, y: 20 }, { x: 280, y: 130 }, REGION);
    const retyped = retypeTextStroke({ ...turned, fontSize: 40 }, "Different words");

    expect(retyped.id).toBe("text-1");
    expect(retyped.text).toBe("Different words");
    expect(retyped.fontSize).toBe(40);
    expect(retyped.rotation).toBeCloseTo(turned.rotation ?? 0);
    expect(retyped.points[0]!.x).toBeCloseTo(turned.points[0]!.x);
    expect(retyped.points[0]!.y).toBeCloseTo(turned.points[0]!.y);
  });

  it("slides a layer back inside the region, and shrinks its type when it is too big", () => {
    const hanging = createTextStroke({ id: "t", corner: { x: 380, y: 280 }, text: "Hanging off", color: SKETCH_STROKE_COLOR });
    const slid = fitTextStroke(hanging, REGION)!;
    const slidXs = slid.points.map((point) => point.x);
    expect(Math.max(...slidXs)).toBeLessThanOrEqual(400 + 1e-6);
    expect(Math.max(...slid.points.map((point) => point.y))).toBeLessThanOrEqual(300 + 1e-6);
    expect(slid.fontSize).toBe(SKETCH_TEXT_FONT_SIZE);

    const long = createTextStroke({ id: "t", corner: { x: 0, y: 0 }, text: "x".repeat(60), color: SKETCH_STROKE_COLOR });
    const shrunk = fitTextStroke(long, REGION)!;
    expect(shrunk.fontSize!).toBeLessThan(SKETCH_TEXT_FONT_SIZE);
    expect(Math.max(...shrunk.points.map((point) => point.x))).toBeLessThanOrEqual(400 + 1e-6);
  });

  it("reports a line too long to fit even in the smallest type instead of letting it hang off the edge", () => {
    const huge = createTextStroke({ id: "t", corner: { x: 0, y: 0 }, text: "x".repeat(200), color: SKETCH_STROKE_COLOR });

    expect(fitTextStroke(huge, REGION)).toBeNull();
  });

  it("scales its type evenly when a corner is dragged", () => {
    const layer = label();
    const frame = strokeFrame(layer);
    const grip = { x: layer.points[2]!.x + frame.padding, y: layer.points[2]!.y + frame.padding };
    const grown = resizeStroke(layer, "se", grip, { x: grip.x + 40, y: grip.y + 40 * (frame.height / frame.width) }, REGION);
    const after = strokeFrame(grown);

    expect(grown.fontSize!).toBeGreaterThan(SKETCH_TEXT_FONT_SIZE);
    expect(after.width / after.height).toBeCloseTo(frame.width / frame.height, 6);
    expect(after.width / frame.width).toBeCloseTo(grown.fontSize! / SKETCH_TEXT_FONT_SIZE, 6);
    expect(grown.points[0]).toEqual(layer.points[0]);
  });

  it("never scales its type below the minimum or past the maximum", () => {
    const layer = label();
    const grip = layer.points[2]!;
    const crushed = resizeStroke(layer, "se", grip, { x: -9999, y: -9999 }, REGION);
    expect(crushed.fontSize!).toBeGreaterThanOrEqual(8 - 1e-9);

    const wide = { minX: -10_000, minY: -10_000, maxX: 10_000, maxY: 10_000 };
    const blown = resizeStroke(layer, "se", grip, { x: 90_000, y: 90_000 }, wide);
    expect(blown.fontSize!).toBeLessThanOrEqual(512 + 1e-9);
  });

  it("is hit anywhere inside its box, including when rotated, but not outside it", () => {
    const layer = label();
    const { width, height } = measureSketchText("Tighten spacing", SKETCH_TEXT_FONT_SIZE);
    const inside = { x: 100 + width / 2, y: 100 + height / 2 };

    expect(findSketchElementAt(inside, [layer])).toBe("text-1");
    expect(findSketchElementAt({ x: 100 + width + 60, y: 100 + height / 2 }, [layer])).toBeNull();

    const turned = rotateStroke(layer, { x: inside.x, y: 20 }, { x: inside.x + 130, y: inside.y }, REGION);
    const center = strokeFrame(turned).center;
    expect(findSketchElementAt(center, [turned])).toBe("text-1");
    // Where the unrotated box used to be is now empty at its far corner.
    expect(findSketchElementAt({ x: 100 + width - 1, y: 100 + 1 }, [turned])).toBeNull();
  });

  it("is erased by crossing its box, not only its outline", () => {
    const layer = label();
    const { width, height } = measureSketchText("Tighten spacing", SKETCH_TEXT_FONT_SIZE);
    const middle = { x: 100 + width / 2, y: 100 + height / 2 };

    expect(findErasedSketchStrokeIds(middle, { x: middle.x + 2, y: middle.y }, [layer], 4)).toEqual(["text-1"]);
    expect(findErasedSketchStrokeIds({ x: 0, y: 0 }, { x: 10, y: 10 }, [layer], 4)).toEqual([]);
  });
});
