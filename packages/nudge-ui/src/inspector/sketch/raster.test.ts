// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { SKETCH_STROKE_COLOR } from "./model.ts";
import { createTextStroke, measureSketchText } from "./text.ts";
import { drawSketchStroke } from "./raster.ts";

describe("sketch stroke rendering", () => {
  it("fills one blue accent freehand outline", () => {
    const context = {
      beginPath: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      fillStyle: "",
      lineCap: "",
      lineJoin: "",
      lineTo: vi.fn(),
      lineWidth: 0,
      moveTo: vi.fn(),
      restore: vi.fn(),
      save: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    drawSketchStroke(context, { kind: "freehand", width: 6, points: [{ x: 10, y: 12 }, { x: 20, y: 22 }] });

    expect(context.fill).toHaveBeenCalledTimes(1);
    expect(context.fillStyle).toBe(SKETCH_STROKE_COLOR);
    expect(context.closePath).toHaveBeenCalledTimes(1);
  });

  it("draws each line of a text layer at its box, turned and scaled with the layer", () => {
    const context = {
      fillStyle: "",
      fillText: vi.fn(),
      font: "",
      restore: vi.fn(),
      rotate: vi.fn(),
      save: vi.fn(),
      textAlign: "",
      textBaseline: "",
      translate: vi.fn(),
    } as unknown as CanvasRenderingContext2D;
    // jsdom has no canvas, so text is measured by its character count.
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    const layer = createTextStroke({
      id: "text-1",
      corner: { x: 10, y: 20 },
      rotation: Math.PI / 6,
      text: "First\nSecond",
      fontSize: 20,
      color: SKETCH_STROKE_COLOR,
    });
    const { width, height, lineHeight } = measureSketchText("First\nSecond", 20);

    drawSketchStroke(context, layer, 2);

    expect(context.rotate).toHaveBeenCalledWith(Math.PI / 6);
    expect(context.font).toContain("40px");
    expect(context.fillStyle).toBe(SKETCH_STROKE_COLOR);
    expect(context.textBaseline).toBe("middle");
    expect(context.fillText).toHaveBeenCalledTimes(2);
    const [first, second] = vi.mocked(context.fillText).mock.calls;
    expect(first![0]).toBe("First");
    expect(second![0]).toBe("Second");
    expect(first![1]).toBeCloseTo((-width / 2) * 2);
    expect(first![2]).toBeCloseTo((-height / 2 + lineHeight / 2) * 2);
    expect(second![2]! - first![2]!).toBeCloseTo(lineHeight * 2);
  });
});
