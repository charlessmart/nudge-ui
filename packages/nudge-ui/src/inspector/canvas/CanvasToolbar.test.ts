import { describe, expect, it } from "vitest";
import { adjacentCanvasZoomLevel, closestCanvasZoomLevel } from "./CanvasToolbar.tsx";

describe("canvas toolbar zoom presets", () => {
  it("snaps arbitrary canvas zoom to the nearest preset", () => {
    expect(closestCanvasZoomLevel(0.82)).toBe(0.9);
    expect(closestCanvasZoomLevel(0.68)).toBe(0.5);
  });

  it("steps through presets and stops at each end", () => {
    expect(adjacentCanvasZoomLevel(0.9, -1)).toBe(0.5);
    expect(adjacentCanvasZoomLevel(0.9, 1)).toBe(1);
    expect(adjacentCanvasZoomLevel(0.25, -1)).toBeNull();
    expect(adjacentCanvasZoomLevel(1, 1)).toBeNull();
  });
});
