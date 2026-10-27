import { describe, expect, it } from "vitest";
import { findScreenMarkers, screenMarkersCleared, SCREEN_MARKER_COLOR, SCREEN_MARKER_SIZE, type PixelImage, type PixelRect } from "./screenMarkers.ts";

type Rgb = readonly [number, number, number];

const MAGENTA = SCREEN_MARKER_COLOR;
/** Pure magenta as a wide-gamut display may hand it back. */
const SHIFTED_MAGENTA: Rgb = [234, 51, 247];
const PINK: Rgb = [255, 105, 180];
/** The inspector's accent, which the panel beside the page shows. */
const ACCENT: Rgb = [0, 150, 255];

function image(width: number, height: number, background: Rgb = [240, 240, 240]): PixelImage & { data: Uint8ClampedArray } {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < data.length; offset += 4) data.set([...background, 255], offset);
  return { width, height, data };
}

function fill(target: PixelImage & { data: Uint8ClampedArray }, rect: PixelRect, color: Rgb): void {
  for (let y = rect.y; y < rect.y + rect.height; y += 1) {
    for (let x = rect.x; x < rect.x + rect.width; x += 1) target.data.set([...color, 255], (y * target.width + x) * 4);
  }
}

/** Draws the four corner markers of a page area placed at `rect`, scaled by `scale` device pixels per CSS pixel. */
function drawMarkers(target: PixelImage & { data: Uint8ClampedArray }, rect: PixelRect, scale: number, color: Rgb = MAGENTA): void {
  const size = SCREEN_MARKER_SIZE * scale;
  const right = rect.x + rect.width - size;
  const bottom = rect.y + rect.height - size;
  for (const [x, y] of [[rect.x, rect.y], [right, rect.y], [rect.x, bottom], [right, bottom]] as const) {
    fill(target, { x, y, width: size, height: size }, color);
  }
}

describe("findScreenMarkers", () => {
  it("finds a page inside a larger window capture at twice the CSS size", () => {
    const capture = image(500, 400);
    const page = { x: 30, y: 70, width: 400, height: 300 };
    drawMarkers(capture, page, 2);

    expect(findScreenMarkers(capture, { width: 200, height: 150 }, MAGENTA)).toEqual(page);
  });

  it("tolerates the colour shift of a wide-gamut capture", () => {
    const capture = image(300, 200);
    const page = { x: 10, y: 20, width: 200, height: 150 };
    drawMarkers(capture, page, 1, SHIFTED_MAGENTA);

    expect(findScreenMarkers(capture, { width: 200, height: 150 }, MAGENTA)).toEqual(page);
  });

  it("ignores marker-coloured content inside the page, and pinks or the panel's accent anywhere", () => {
    const capture = image(300, 200);
    const page = { x: 10, y: 20, width: 200, height: 150 };
    drawMarkers(capture, page, 1);
    fill(capture, { x: 60, y: 60, width: 40, height: 40 }, MAGENTA);
    // Pink anywhere, and accent blue in the panel beside the page, are not markers.
    fill(capture, { x: 250, y: 0, width: 25, height: 200 }, PINK);
    fill(capture, { x: 275, y: 0, width: 25, height: 200 }, ACCENT);

    expect(findScreenMarkers(capture, { width: 200, height: 150 }, MAGENTA)).toEqual(page);
  });

  it("refuses a match with the wrong shape, a covered corner, or no markers", () => {
    const capture = image(300, 200);
    const page = { x: 10, y: 20, width: 200, height: 150 };

    expect(findScreenMarkers(capture, { width: 200, height: 150 }, MAGENTA)).toBeNull();

    drawMarkers(capture, page, 1);

    expect(findScreenMarkers(capture, { width: 200, height: 100 }, MAGENTA)).toBeNull();

    fill(capture, { x: 198, y: 158, width: 12, height: 12 }, [20, 20, 20]);

    expect(findScreenMarkers(capture, { width: 200, height: 150 }, MAGENTA)).toBeNull();
  });
});

describe("screenMarkersCleared", () => {
  it("tells a frame without the markers from one that still shows them", () => {
    const capture = image(300, 200);
    const page = { x: 10, y: 20, width: 200, height: 150 };
    drawMarkers(capture, page, 1);

    expect(screenMarkersCleared(capture, page, 1, MAGENTA)).toBe(false);
    expect(screenMarkersCleared(image(300, 200), page, 1, MAGENTA)).toBe(true);
  });
});
