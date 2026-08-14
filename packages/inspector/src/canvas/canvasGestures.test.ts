import { describe, expect, it } from "vitest";
import { iframePointToClientPoint, zoomCameraAtPointer } from "./canvasGestures.ts";

describe("canvas gesture coordinate conversion", () => {
  it("keeps the world point under the pointer fixed while zooming", () => {
    const next = zoomCameraAtPointer(
      { x: 10, y: 20, zoom: 1 },
      { x: 200, y: 150 },
      { left: 100, top: 50 },
      -100,
    );

    expect(next.zoom).toBeCloseTo(1.08);
    expect(next.x).toBeCloseTo(2.8);
    expect(next.y).toBeCloseTo(13.6);
  });

  it("projects iframe-local coordinates through the board camera", () => {
    expect(iframePointToClientPoint(
      { left: 100, top: 50 },
      { x: 40, y: 30 },
      1.5,
    )).toEqual({ x: 160, y: 95 });
  });
});
