import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSketchDrawingTools,
  resetSketchDrawingTool,
  restoreDefaultSketchDrawingTools,
  setSketchDrawingTool,
  setSketchStrokeColor,
  subscribeSketchDrawingTools,
} from "./drawingTools.ts";
import { SKETCH_PEN_COLORS, SKETCH_STROKE_COLOR } from "./model.ts";

const red = SKETCH_PEN_COLORS.find((color) => color.id === "red")!;

afterEach(() => {
  restoreDefaultSketchDrawingTools();
});

describe("sketch drawing tools", () => {
  it("starts with the pen and the default stroke color", () => {
    expect(getSketchDrawingTools().tool).toBe("pen");
    expect(getSketchDrawingTools().color.value).toBe(SKETCH_STROKE_COLOR);
  });

  it("hands the eraser back to the pen when a color is chosen", () => {
    setSketchDrawingTool("eraser");
    setSketchStrokeColor(red);

    expect(getSketchDrawingTools()).toEqual({ tool: "pen", color: red });
  });

  it("keeps the rectangle tool when a color is chosen", () => {
    setSketchDrawingTool("rectangle");
    setSketchStrokeColor(red);

    expect(getSketchDrawingTools()).toEqual({ tool: "rectangle", color: red });
  });

  it("resets to the pen for a new session but keeps the color", () => {
    setSketchStrokeColor(red);
    setSketchDrawingTool("eraser");
    resetSketchDrawingTool();

    expect(getSketchDrawingTools()).toEqual({ tool: "pen", color: red });
  });

  it("notifies subscribers only on change and survives a failing one", () => {
    const failing = vi.fn(() => {
      throw new Error("view failed");
    });
    const listener = vi.fn();
    const unsubscribeFailing = subscribeSketchDrawingTools(failing);
    const unsubscribe = subscribeSketchDrawingTools(listener);

    setSketchDrawingTool("pen");
    expect(listener).not.toHaveBeenCalled();

    setSketchDrawingTool("eraser");
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribeFailing();
    unsubscribe();
  });
});
