import { describe, expect, it } from "vitest";
import {
  CANVAS_RESIZE_HANDLE_MAX_SCALE,
  CANVAS_RESIZE_HANDLE_MIN_SCALE,
  getCanvasResizeHandleScale,
} from "./resizeHandleScale.ts";
import { MAX_CAMERA_ZOOM, MIN_CAMERA_ZOOM } from "./canvasStore.ts";

describe("getCanvasResizeHandleScale", () => {
  it("keeps the resize hit target at a stable screen size across board zoom", () => {
    const screenScale = (zoom: number): number => zoom * getCanvasResizeHandleScale(zoom);

    expect(screenScale(MIN_CAMERA_ZOOM)).toBeCloseTo(0.5);
    expect(0.75 * getCanvasResizeHandleScale(0.75)).toBeCloseTo(1);
    expect(2 * getCanvasResizeHandleScale(2)).toBeCloseTo(1);
    expect(screenScale(MAX_CAMERA_ZOOM)).toBeCloseTo(1);
  });

  it("keeps inverse scaling within the resize affordance bounds", () => {
    expect(getCanvasResizeHandleScale(0.25)).toBe(CANVAS_RESIZE_HANDLE_MAX_SCALE);
    expect(getCanvasResizeHandleScale(100)).toBe(CANVAS_RESIZE_HANDLE_MIN_SCALE);
    expect(getCanvasResizeHandleScale(0)).toBe(CANVAS_RESIZE_HANDLE_MAX_SCALE);
    expect(getCanvasResizeHandleScale(Number.NaN)).toBe(CANVAS_RESIZE_HANDLE_MAX_SCALE);
    expect(getCanvasResizeHandleScale(Number.POSITIVE_INFINITY)).toBe(CANVAS_RESIZE_HANDLE_MAX_SCALE);
  });
});
