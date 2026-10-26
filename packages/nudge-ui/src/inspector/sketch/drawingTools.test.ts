// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getSketchDrawingTools,
  resetSketchDrawingTool,
  setSketchDrawingTool,
  setSketchStrokeColor,
  subscribeSketchDrawingTools,
} from "./drawingTools.ts";
import { sketchToolForEvent } from "../canvas/sketch/sketchShortcuts.ts";
import { SKETCH_PEN_COLORS, SKETCH_STROKE_COLOR } from "./model.ts";

const red = SKETCH_PEN_COLORS.find((color) => color.id === "red")!;
const defaultColor = SKETCH_PEN_COLORS.find((color) => color.value === SKETCH_STROKE_COLOR)!;

afterEach(() => {
  setSketchDrawingTool("pen");
  setSketchStrokeColor(defaultColor);
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

describe("sketch tool shortcuts", () => {
  function press(code: string, init: KeyboardEventInit = {}): KeyboardEvent {
    return new KeyboardEvent("keydown", { code, bubbles: true, composed: true, ...init });
  }

  it("picks the pen, eraser, rectangle and text tools from P, E, R and T", () => {
    expect(sketchToolForEvent(press("KeyP"))).toBe("pen");
    expect(sketchToolForEvent(press("KeyE"))).toBe("eraser");
    expect(sketchToolForEvent(press("KeyR"))).toBe("rectangle");
    expect(sketchToolForEvent(press("KeyT"))).toBe("text");
  });

  it("ignores other keys, modifier chords, and held keys", () => {
    expect(sketchToolForEvent(press("KeyV"))).toBeNull();
    expect(sketchToolForEvent(press("KeyP", { shiftKey: true }))).toBeNull();
    expect(sketchToolForEvent(press("KeyR", { metaKey: true }))).toBeNull();
    expect(sketchToolForEvent(press("KeyR", { ctrlKey: true }))).toBeNull();
    expect(sketchToolForEvent(press("KeyT", { altKey: true }))).toBeNull();
    expect(sketchToolForEvent(press("KeyT", { shiftKey: true }))).toBeNull();
    expect(sketchToolForEvent(press("KeyE", { repeat: true }))).toBeNull();
  });

  it("leaves the letters to a text field being typed in", () => {
    const input = document.createElement("input");
    document.body.append(input);
    let picked: unknown = "unset";
    window.addEventListener("keydown", (event) => { picked = sketchToolForEvent(event); }, { once: true });
    input.dispatchEvent(press("KeyT"));
    expect(picked).toBeNull();
    input.remove();
  });
});
