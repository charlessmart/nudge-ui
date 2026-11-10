export const MIN_CARD_WIDTH = 200;
export const MIN_CARD_HEIGHT = 150;
/** Within this many pixels of the board's sides, a focus resize snaps the frame to the full board width. */
export const FOCUS_EDGE_SNAP_DISTANCE = 16;

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

const RESIZE_EDGES = {
  "top-left": { horizontal: "left", vertical: "top" },
  top: { horizontal: null, vertical: "top" },
  "top-right": { horizontal: "right", vertical: "top" },
  right: { horizontal: "right", vertical: null },
  "bottom-right": { horizontal: "right", vertical: "bottom" },
  bottom: { horizontal: null, vertical: "bottom" },
  "bottom-left": { horizontal: "left", vertical: "bottom" },
  left: { horizontal: "left", vertical: null },
} satisfies Record<CanvasResizeDirection, ResizeEdges>;

export function getCanvasResizeEdges(direction: CanvasResizeDirection): ResizeEdges {
  return RESIZE_EDGES[direction];
}

/** Minimum dimensions clamp at the moving edge, so dragging past it never moves the anchored side. */
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

/**
 * Focus centres the frame on the board, so an edge drag grows both sides at once and the dragged edge stays under the
 * pointer. Close enough to the board's sides, the frame snaps to fill it.
 */
export function resizeFocusWidth(
  startWidth: number,
  edge: "left" | "right",
  deltaX: number,
  boardWidth: number,
): number {
  const growth = edge === "right" ? deltaX : -deltaX;
  const width = Math.min(boardWidth, Math.max(MIN_CARD_WIDTH, startWidth + growth * 2));
  return (boardWidth - width) / 2 <= FOCUS_EDGE_SNAP_DISTANCE ? boardWidth : width;
}

// A Focus resize snaps to the board inside this band (see resizeFocusWidth), so a frame this close to a board width
// can only have got there by the board moving under it, never by a deliberate resize.
const FOCUS_SNAPPED_BAND = FOCUS_EDGE_SNAP_DISTANCE * 2;

function fillsBoard(frameWidth: number, boardWidth: number): boolean {
  return frameWidth < boardWidth + 1 && frameWidth >= boardWidth - FOCUS_SNAPPED_BAND;
}

/**
 * A frame that fills the board in Focus keeps filling it as the board resizes, such as when the inspector hides; a
 * narrower or wider frame keeps its own width. A frame just short of either board width also counts as filling it,
 * so one sized while the board was mid-change (the panel opening, a scrollbar coming and going) still snaps rather
 * than staying inset. Returns the new width, or null to leave the frame as it is.
 */
export function followFocusBoardWidth(frameWidth: number, previousBoardWidth: number, boardWidth: number): number | null {
  if (Math.abs(frameWidth - boardWidth) < 1) return null;
  return fillsBoard(frameWidth, previousBoardWidth) || fillsBoard(frameWidth, boardWidth) ? boardWidth : null;
}
