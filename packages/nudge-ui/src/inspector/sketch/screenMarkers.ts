/**
 * Corner markers that locate the page inside a screen or window capture. Safari and Firefox can share only a window or
 * a screen, so the page's place in the picture is unknown until these four squares are found in it.
 */

/** Each marker's size in CSS pixels: big enough to survive scaling, small enough to flash by unnoticed. */
export const SCREEN_MARKER_SIZE = 12;

/** The markers' colour as red, green and blue, 0 to 255. */
export type MarkerColor = readonly [number, number, number];

/**
 * Magenta, which Nudge UI never uses. The shared picture includes the panel beside the page, so a colour the panel
 * uses (such as the accent) would be found there and break the corner search.
 */
export const SCREEN_MARKER_COLOR: MarkerColor = [255, 0, 255];

/** The raw pixels of one captured frame, as `getImageData` returns them. */
export interface PixelImage {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8ClampedArray;
}

export interface PixelRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** How far the two axes may disagree about the page's scale before the match is rejected. */
const SCALE_TOLERANCE = 0.02;
/** A marker drawn into the picture covers at least this much of its square once anti-aliased edges are allowed for. */
const MARKER_COVERAGE = 0.6;
/** A marker that has been removed covers less than this, so the frame is known to be newer than the markers. */
const CLEARED_COVERAGE = 0.2;

/** Per channel: loose enough for colour management, which shifts a saturated colour on wide-gamut displays. */
const COLOR_TOLERANCE = 64;

function isMarkerPixel(data: Uint8ClampedArray, offset: number, color: MarkerColor): boolean {
  return Math.abs(data[offset]! - color[0]) <= COLOR_TOLERANCE
    && Math.abs(data[offset + 1]! - color[1]) <= COLOR_TOLERANCE
    && Math.abs(data[offset + 2]! - color[2]) <= COLOR_TOLERANCE;
}

function coverage(image: PixelImage, rect: PixelRect, color: MarkerColor): number {
  const left = Math.max(0, Math.round(rect.x));
  const top = Math.max(0, Math.round(rect.y));
  const right = Math.min(image.width, Math.round(rect.x + rect.width));
  const bottom = Math.min(image.height, Math.round(rect.y + rect.height));
  if (right <= left || bottom <= top) return 0;
  let hits = 0;
  for (let y = top; y < bottom; y += 1) {
    for (let x = left; x < right; x += 1) {
      if (isMarkerPixel(image.data, (y * image.width + x) * 4, color)) hits += 1;
    }
  }
  return hits / ((right - left) * (bottom - top));
}

/** The four marker squares inside `rect`, inset by a pixel so anti-aliased edges do not count against them. */
function cornerSquares(rect: PixelRect, scale: number): PixelRect[] {
  const size = Math.max(1, SCREEN_MARKER_SIZE * scale - 2);
  const right = rect.x + rect.width - 1 - size;
  const bottom = rect.y + rect.height - 1 - size;
  return [
    { x: rect.x + 1, y: rect.y + 1, width: size, height: size },
    { x: right, y: rect.y + 1, width: size, height: size },
    { x: rect.x + 1, y: bottom, width: size, height: size },
    { x: right, y: bottom, width: size, height: size },
  ];
}

interface Extreme {
  value: number;
  x: number;
  y: number;
}

/**
 * Finds the page area, `area` CSS pixels in size, whose corners carry markers in `color`. The outermost marker pixels in
 * each diagonal direction are the area's corners, so marker-coloured content inside the page cannot move them; the
 * result must also have the page's shape and solid markers in all four corners, or nothing is returned.
 */
export function findScreenMarkers(
  image: PixelImage,
  area: { readonly width: number; readonly height: number },
  color: MarkerColor,
): PixelRect | null {
  const topLeft: Extreme = { value: Infinity, x: 0, y: 0 };
  const bottomRight: Extreme = { value: -Infinity, x: 0, y: 0 };
  const topRight: Extreme = { value: -Infinity, x: 0, y: 0 };
  const bottomLeft: Extreme = { value: Infinity, x: 0, y: 0 };
  const { width, height, data } = image;
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    for (let x = 0; x < width; x += 1) {
      if (!isMarkerPixel(data, (row + x) * 4, color)) continue;
      const sum = x + y;
      const difference = x - y;
      if (sum < topLeft.value) Object.assign(topLeft, { value: sum, x, y });
      if (sum > bottomRight.value) Object.assign(bottomRight, { value: sum, x, y });
      if (difference > topRight.value) Object.assign(topRight, { value: difference, x, y });
      if (difference < bottomLeft.value) Object.assign(bottomLeft, { value: difference, x, y });
    }
  }
  if (topLeft.value === Infinity) return null;

  const rect = { x: topLeft.x, y: topLeft.y, width: bottomRight.x - topLeft.x + 1, height: bottomRight.y - topLeft.y + 1 };
  const scale = rect.width / area.width;
  if (!(scale > 0) || Math.abs(rect.height / area.height - scale) > scale * SCALE_TOLERANCE) return null;
  const slack = Math.max(2, scale * 2);
  if (Math.abs(topRight.x - bottomRight.x) > slack || Math.abs(topRight.y - topLeft.y) > slack
    || Math.abs(bottomLeft.x - topLeft.x) > slack || Math.abs(bottomLeft.y - bottomRight.y) > slack) return null;
  if (cornerSquares(rect, scale).some((square) => coverage(image, square, color) < MARKER_COVERAGE)) return null;
  return rect;
}

/** Whether a frame was taken after the markers were removed from `rect`. */
export function screenMarkersCleared(image: PixelImage, rect: PixelRect, scale: number, color: MarkerColor): boolean {
  return cornerSquares(rect, scale).every((square) => coverage(image, square, color) < CLEARED_COVERAGE);
}
