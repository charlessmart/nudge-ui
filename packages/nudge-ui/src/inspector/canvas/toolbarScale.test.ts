import { describe, expect, it } from "vitest";
import {
  CANVAS_TOOLBAR_MAX_SCALE,
  CANVAS_TOOLBAR_SCALE_CAP_ZOOM,
  getCanvasToolbarScale,
} from "./toolbarScale.ts";

describe("getCanvasToolbarScale", () => {
  it("compensates for board zoom so controls retain their screen size", () => {
    expect(getCanvasToolbarScale(1)).toBe(1);
    expect(getCanvasToolbarScale(2)).toBe(0.5);
    expect(getCanvasToolbarScale(0.75)).toBeCloseTo(1 / 0.75);
  });

  it("caps the compensation once controls would be twice their base world size", () => {
    expect(getCanvasToolbarScale(CANVAS_TOOLBAR_SCALE_CAP_ZOOM)).toBe(CANVAS_TOOLBAR_MAX_SCALE);
    expect(getCanvasToolbarScale(0.1)).toBe(CANVAS_TOOLBAR_MAX_SCALE);
  });

  it("uses the cap for invalid or non-positive zoom values", () => {
    expect(getCanvasToolbarScale(0)).toBe(CANVAS_TOOLBAR_MAX_SCALE);
    expect(getCanvasToolbarScale(Number.NaN)).toBe(CANVAS_TOOLBAR_MAX_SCALE);
  });
});
