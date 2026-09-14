import { describe, expect, it } from "vitest";
import { projectMeasurementSegments } from "./measurementProjection.ts";

describe("projectMeasurementSegments", () => {
  it("projects endpoints through the board zoom without scaling pixel labels", () => {
    expect(projectMeasurementSegments(
      { left: 100, top: 80, width: 500, height: 300 },
      [{
        id: "primary-horizontal-0",
        kind: "ruler",
        axis: "horizontal",
        from: { x: 20, y: 40 },
        to: { x: 120, y: 40 },
        distance: 100,
      }],
      0.5,
    )).toEqual([{
      id: "primary-horizontal-0",
      kind: "ruler",
      axis: "horizontal",
      from: { x: 110, y: 100 },
      to: { x: 160, y: 100 },
      distance: 100,
    }]);
  });
});
