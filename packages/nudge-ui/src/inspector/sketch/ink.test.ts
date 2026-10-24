import { describe, expect, it } from "vitest";
import { sketchInkBounds, sketchThumbnailCrop } from "./ink.ts";

describe("sketch ink", () => {
  it("bounds every mark, line width included, within the image", () => {
    const strokes = [
      { width: 6, points: [{ x: 100, y: 50 }, { x: 140, y: 80 }] },
      { width: 4, points: [{ x: 120, y: 200 }] },
    ];
    expect(sketchInkBounds(strokes, 400, 300)).toEqual({ x: 97, y: 47, width: 46, height: 155 });
    expect(sketchInkBounds([{ width: 6, points: [{ x: 1, y: 1 }, { x: 399, y: 299 }] }], 400, 300))
      .toEqual({ x: 0, y: 0, width: 400, height: 300 });
  });

  it("has no bounds when nothing is drawn", () => {
    expect(sketchInkBounds([], 400, 300)).toBeNull();
    expect(sketchInkBounds([{ width: 6, points: [] }], 400, 300)).toBeNull();
  });

  it("crops a square around the marks with a margin", () => {
    expect(sketchThumbnailCrop({ x: 400, y: 300, width: 200, height: 100 }, 1000, 800))
      .toEqual({ x: 364, y: 214, width: 272, height: 272 });
  });

  it("keeps a small mark from zooming in too far, and the crop inside the image", () => {
    expect(sketchThumbnailCrop({ x: 10, y: 10, width: 20, height: 20 }, 1000, 800))
      .toEqual({ x: 0, y: 0, width: 160, height: 160 });
    expect(sketchThumbnailCrop({ x: 0, y: 0, width: 1000, height: 800 }, 1000, 800))
      .toEqual({ x: 100, y: 0, width: 800, height: 800 });
  });
});
