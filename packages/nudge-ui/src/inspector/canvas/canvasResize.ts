export const MIN_CARD_WIDTH = 200;
export const MIN_CARD_HEIGHT = 150;

export type CanvasResizeDirection =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left";

export interface CanvasResizeRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CanvasResizeDelta {
  readonly x: number;
  readonly y: number;
}

export interface CanvasResizeMinimum {
  readonly width: number;
  readonly height: number;
}

interface ResizeEdges {
  readonly horizontal: "left" | "right" | null;
  readonly vertical: "top" | "bottom" | null;
}

const RESIZE_EDGES: Record<CanvasResizeDirection, ResizeEdges> = {
  "top-left": { horizontal: "left", vertical: "top" },
  top: { horizontal: null, vertical: "top" },
  "top-right": { horizontal: "right", vertical: "top" },
  right: { horizontal: "right", vertical: null },
  "bottom-right": { horizontal: "right", vertical: "bottom" },
  bottom: { horizontal: null, vertical: "bottom" },
  "bottom-left": { horizontal: "left", vertical: "bottom" },
  left: { horizontal: "left", vertical: null },
};

/** Returns the anchored edges affected by a resize handle. */
export function getCanvasResizeEdges(direction: CanvasResizeDirection): ResizeEdges {
  return RESIZE_EDGES[direction];
}

/**
 * Applies a pointer delta to a Canvas card while keeping the opposite edges
 * fixed. Minimum dimensions are clamped at the moving edge, so dragging past
 * the minimum does not move the anchored side.
 */
export function resizeCanvasRect(
  rect: CanvasResizeRect,
  direction: CanvasResizeDirection,
  delta: CanvasResizeDelta,
  minimum: CanvasResizeMinimum = { width: MIN_CARD_WIDTH, height: MIN_CARD_HEIGHT },
): CanvasResizeRect {
  const edges = getCanvasResizeEdges(direction);
  const minWidth = Math.max(0, minimum.width);
  const minHeight = Math.max(0, minimum.height);
  const initialWidth = Math.max(rect.width, minWidth);
  const initialHeight = Math.max(rect.height, minHeight);
  const initialRight = rect.x + initialWidth;
  const initialBottom = rect.y + initialHeight;

  let left = rect.x;
  let right = initialRight;
  let top = rect.y;
  let bottom = initialBottom;

  if (edges.horizontal === "left") {
    left = Math.min(initialRight - minWidth, rect.x + delta.x);
  } else if (edges.horizontal === "right") {
    right = Math.max(rect.x + minWidth, initialRight + delta.x);
  }

  if (edges.vertical === "top") {
    top = Math.min(initialBottom - minHeight, rect.y + delta.y);
  } else if (edges.vertical === "bottom") {
    bottom = Math.max(rect.y + minHeight, initialBottom + delta.y);
  }

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}
