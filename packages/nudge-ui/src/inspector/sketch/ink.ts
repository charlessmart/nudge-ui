import type { SketchInk, SketchStroke } from "./model.ts";

/** The box around every mark, line width included, clipped to the image. Null when nothing visible is drawn. */
export function sketchInkBounds(
  strokes: readonly Pick<SketchStroke, "points" | "width">[],
  imageWidth: number,
  imageHeight: number,
): SketchInk | null {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const stroke of strokes) {
    const reach = stroke.width / 2;
    for (const point of stroke.points) {
      minX = Math.min(minX, point.x - reach);
      minY = Math.min(minY, point.y - reach);
      maxX = Math.max(maxX, point.x + reach);
      maxY = Math.max(maxY, point.y + reach);
    }
  }
  const x = Math.max(0, Math.floor(minX));
  const y = Math.max(0, Math.floor(minY));
  const width = Math.min(imageWidth, Math.ceil(maxX)) - x;
  const height = Math.min(imageHeight, Math.ceil(maxY)) - y;
  return Number.isFinite(minX) && width > 0 && height > 0 ? { x, y, width, height } : null;
}

/** Thumbnails never zoom in past this many image pixels, so a small tick does not fill the tile. */
const MIN_CROP_EDGE = 160;
/** Breathing room around the marks, as a share of their longer side. */
const CROP_MARGIN = 0.18;

/**
 * The square of the image a thumbnail should show: centred on the marks with some margin,
 * as small as that allows, and shifted to stay inside the image.
 */
export function sketchThumbnailCrop(ink: SketchInk, imageWidth: number, imageHeight: number): SketchInk {
  const longest = Math.max(ink.width, ink.height);
  const side = Math.min(Math.max(longest * (1 + CROP_MARGIN * 2), MIN_CROP_EDGE), imageWidth, imageHeight);
  const x = Math.min(Math.max(ink.x + ink.width / 2 - side / 2, 0), imageWidth - side);
  const y = Math.min(Math.max(ink.y + ink.height / 2 - side / 2, 0), imageHeight - side);
  return { x, y, width: side, height: side };
}
