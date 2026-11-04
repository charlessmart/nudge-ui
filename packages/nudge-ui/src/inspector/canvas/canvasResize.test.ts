import { describe, expect, it } from "vitest";
import {
  FOCUS_EDGE_SNAP_DISTANCE,
  MIN_CARD_HEIGHT,
  MIN_CARD_WIDTH,
  followFocusBoardWidth,
  resizeCanvasRect,
  resizeFocusWidth,
  type CanvasResizeDirection,
  type CanvasResizeRect,
} from "./canvasResize.ts";

const START: CanvasResizeRect = { x: 100, y: 80, width: 800, height: 600 };

describe("resizeCanvasRect", () => {
  const resizeCases: readonly { direction: CanvasResizeDirection; expected: CanvasResizeRect }[] = [
    { direction: "left", expected: { x: 60, y: 80, width: 840, height: 600 } },
    { direction: "right", expected: { x: 100, y: 80, width: 760, height: 600 } },
    { direction: "top", expected: { x: 100, y: 50, width: 800, height: 630 } },
    { direction: "bottom", expected: { x: 100, y: 80, width: 800, height: 570 } },
    { direction: "top-left", expected: { x: 60, y: 50, width: 840, height: 630 } },
    { direction: "top-right", expected: { x: 100, y: 50, width: 760, height: 630 } },
    { direction: "bottom-left", expected: { x: 60, y: 80, width: 840, height: 570 } },
    { direction: "bottom-right", expected: { x: 100, y: 80, width: 760, height: 570 } },
  ];

  for (const { direction, expected } of resizeCases) {
    it(`resizes from the ${direction} edge while anchoring the opposite edges`, () => {
      expect(resizeCanvasRect(START, direction, { x: -40, y: -30 })).toEqual(expected);
    });
  }

  it("clamps a left-edge resize at the minimum width and keeps the right edge fixed", () => {
    expect(resizeCanvasRect(START, "left", { x: 1_000, y: 0 })).toEqual({
      x: 700,
      y: 80,
      width: MIN_CARD_WIDTH,
      height: 600,
    });
  });

  it("clamps a top-edge resize at the minimum height and keeps the bottom edge fixed", () => {
    expect(resizeCanvasRect(START, "top", { x: 0, y: 1_000 })).toEqual({
      x: 100,
      y: 530,
      width: 800,
      height: MIN_CARD_HEIGHT,
    });
  });

  it("keeps an unaffected dimension at the minimum when a restored card is undersized", () => {
    expect(resizeCanvasRect(
      { x: 10, y: 20, width: 100, height: 90 },
      "right",
      { x: 0, y: 0 },
    )).toMatchObject({ width: MIN_CARD_WIDTH, height: MIN_CARD_HEIGHT });
  });
});

describe("resizeFocusWidth", () => {
  it("grows both sides of the centred frame so the dragged edge follows the pointer", () => {
    expect(resizeFocusWidth(600, "right", 50, 1200)).toBe(700);
    expect(resizeFocusWidth(600, "left", -50, 1200)).toBe(700);
    expect(resizeFocusWidth(600, "left", 50, 1200)).toBe(500);
  });

  it("snaps to the full board width near the board's sides", () => {
    const nearlyFull = 1200 - FOCUS_EDGE_SNAP_DISTANCE * 2;
    expect(resizeFocusWidth(nearlyFull - 2, "right", 1, 1200)).toBe(1200);
    expect(resizeFocusWidth(nearlyFull - 2, "right", 0, 1200)).toBe(nearlyFull - 2);
    expect(resizeFocusWidth(600, "right", 5_000, 1200)).toBe(1200);
  });

  it("keeps the minimum frame width", () => {
    expect(resizeFocusWidth(600, "right", -5_000, 1200)).toBe(MIN_CARD_WIDTH);
  });
});

describe("followFocusBoardWidth", () => {
  it("keeps a frame that fills the board filling it as the board grows or shrinks", () => {
    expect(followFocusBoardWidth(1000, 1000, 1300)).toBe(1300);
    expect(followFocusBoardWidth(1300, 1300, 1000)).toBe(1000);
    expect(followFocusBoardWidth(999.6, 1000, 1300)).toBe(1300);
  });

  it("leaves narrower and wider frames at their own width", () => {
    expect(followFocusBoardWidth(800, 1000, 1300)).toBeNull();
    expect(followFocusBoardWidth(1440, 1000, 1300)).toBeNull();
    expect(followFocusBoardWidth(1000, 1000, 1000)).toBeNull();
  });
});
