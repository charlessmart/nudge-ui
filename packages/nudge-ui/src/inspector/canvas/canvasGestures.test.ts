import { describe, expect, it } from "vitest";
import { ZOOM_WHEEL_FACTOR, zoomCameraAbout, zoomCameraAtPointer } from "./canvasGestures.ts";

describe("canvas gesture coordinate conversion", () => {
  const camera = { x: 0, y: 0, zoom: 1 };
  const at = { x: 0, y: 0 };
  const rect = { left: 0, top: 0 };

  it("scales a wheel zoom step by the size of the delta", () => {
    expect(zoomCameraAtPointer(camera, at, rect, -100).zoom).toBeCloseTo(ZOOM_WHEEL_FACTOR);
    expect(zoomCameraAtPointer(camera, at, rect, 100).zoom).toBeCloseTo(1 / ZOOM_WHEEL_FACTOR);
    expect(zoomCameraAtPointer(camera, at, rect, -5).zoom).toBeCloseTo(ZOOM_WHEEL_FACTOR ** 0.05);
  });

  it("caps one event at a full notch", () => {
    expect(zoomCameraAtPointer(camera, at, rect, -1000).zoom).toBeCloseTo(ZOOM_WHEEL_FACTOR);
    expect(zoomCameraAtPointer(camera, at, rect, 1000).zoom).toBeCloseTo(1 / ZOOM_WHEEL_FACTOR);
  });

  it("zooms to a level about a board point that stays put", () => {
    const next = zoomCameraAbout({ x: 100, y: 50, zoom: 1 }, 2, { x: 300, y: 250 });
    expect(next).toEqual({ x: -100, y: -150, zoom: 2 });
    expect(zoomCameraAbout(camera, 100, at).zoom).toBe(3);
  });

  it("keeps the world point under the pointer fixed while zooming", () => {
    const next = zoomCameraAtPointer(
      { x: 10, y: 20, zoom: 1 },
      { x: 200, y: 150 },
      { left: 100, top: 50 },
      -100,
    );

    expect(next.zoom).toBeCloseTo(ZOOM_WHEEL_FACTOR);
    expect(next.x).toBeCloseTo(100 - 90 * ZOOM_WHEEL_FACTOR);
    expect(next.y).toBeCloseTo(100 - 80 * ZOOM_WHEEL_FACTOR);
  });
});
