import { describe, expect, it } from "vitest";
import { getMeasurementGeometry } from "./measurementGeometry.ts";

function rect(left: number, top: number, width: number, height: number) {
  return { left, top, width, height };
}

function rulers(selected: ReturnType<typeof rect>, hovered: ReturnType<typeof rect>) {
  return getMeasurementGeometry(selected, hovered).segments
    .filter((segment) => segment.kind === "ruler")
    .map((segment) => ({ id: segment.id, axis: segment.axis, distance: segment.distance }));
}

describe("getMeasurementGeometry", () => {
  it("measures nearest facing edges for side-by-side boxes", () => {
    expect(rulers(rect(300, 100, 80, 80), rect(100, 100, 100, 80))).toEqual([
      { id: "primary-horizontal-0", axis: "horizontal", distance: 100 },
    ]);
  });

  it("measures both horizontal and vertical gaps for diagonal boxes", () => {
    const geometry = getMeasurementGeometry(rect(300, 320, 80, 80), rect(100, 100, 100, 100));
    expect(rulers(rect(300, 320, 80, 80), rect(100, 100, 100, 100))).toEqual([
      { id: "primary-horizontal-0", axis: "horizontal", distance: 100 },
      { id: "primary-vertical-0", axis: "vertical", distance: 120 },
    ]);
    expect(geometry.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "projection-horizontal-0",
        kind: "projection",
        axis: "vertical",
        from: { x: 200, y: 200 },
        to: { x: 200, y: 360 },
      }),
      expect.objectContaining({
        id: "projection-vertical-0",
        kind: "projection",
        axis: "horizontal",
        from: { x: 200, y: 200 },
        to: { x: 340, y: 200 },
      }),
    ]));
  });

  it("extends each separated ruler perpendicularly from the hovered edge", () => {
    const geometry = getMeasurementGeometry(rect(300, 120, 100, 60), rect(100, 100, 100, 100));
    expect(geometry.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "projection-vertical-0", kind: "projection", axis: "horizontal" }),
      expect.objectContaining({ id: "projection-vertical-1", kind: "projection", axis: "horizontal" }),
    ]));
  });

  it("uses the hovered far edge instead of a negative gap for partial overlap", () => {
    const geometry = getMeasurementGeometry(rect(180, 120, 160, 160), rect(100, 100, 140, 140));
    expect(geometry.segments).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "primary-horizontal-0", kind: "ruler", axis: "horizontal", distance: 80 }),
      expect.objectContaining({ id: "primary-vertical-0", kind: "ruler", axis: "vertical", distance: 20 }),
      expect.objectContaining({ id: "projection-vertical-0", kind: "projection" }),
    ]));
    expect(geometry.segments).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "projection-horizontal-0" }),
    ]));
  });

  it("shows both inset measurements when one box contains the other", () => {
    expect(rulers(rect(140, 120, 120, 60), rect(100, 100, 200, 100))).toEqual(expect.arrayContaining([
      { id: "primary-horizontal-0", axis: "horizontal", distance: 40 },
      { id: "primary-horizontal-1", axis: "horizontal", distance: 40 },
      { id: "primary-vertical-0", axis: "vertical", distance: 20 },
      { id: "primary-vertical-1", axis: "vertical", distance: 20 },
    ]));
  });

  it("does not add zero-length rulers or projections for identical boxes", () => {
    expect(getMeasurementGeometry(rect(100, 100, 100, 100), rect(100, 100, 100, 100))).toEqual({ segments: [] });
  });
});
