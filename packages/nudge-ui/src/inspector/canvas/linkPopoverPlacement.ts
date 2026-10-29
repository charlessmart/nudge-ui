/** Placement for the "Open in new frame" action that appears over a hovered link. */

export interface LinkPopoverRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface LinkPopoverSize {
  readonly width: number;
  readonly height: number;
}

export interface LinkPopoverPoint {
  readonly x: number;
  readonly y: number;
}

export type LinkPopoverAnchor =
  | { readonly kind: "rect"; readonly rect: LinkPopoverRect }
  | ({ readonly kind: "point" } & LinkPopoverPoint);

export interface LinkPopoverPosition {
  readonly left: number;
  readonly top: number;
}

/** Fallback size until the mounted action reports its real box. */
export const LINK_POPOVER_WIDTH = 160;
export const LINK_POPOVER_HEIGHT = 28;
export const LINK_POPOVER_MARGIN = 8;
/** Offsets used only when the frame reports a pointer but no link rect. */
const POINTER_LEFT_OFFSET = 14;
const POINTER_TOP_OFFSET = 18;

/**
 * Centers the action immediately above its link, the way the DOM navigator chip hugs its element,
 * and keeps it inside the board. The action drops below the link when the top edge is close, and
 * falls back to the pointer when the frame reports no link rect.
 */
export function placeLinkPopover(
  anchor: LinkPopoverAnchor | null,
  size: LinkPopoverSize,
  board: LinkPopoverRect,
): LinkPopoverPosition | null {
  if (!anchor) return null;
  const minLeft = board.left + LINK_POPOVER_MARGIN;
  const maxLeft = board.left + board.width - size.width - LINK_POPOVER_MARGIN;
  const minTop = board.top + LINK_POPOVER_MARGIN;
  const maxTop = board.top + board.height - size.height - LINK_POPOVER_MARGIN;
  const clampLeft = (value: number): number => maxLeft < minLeft
    ? board.left + (board.width - size.width) / 2
    : Math.min(Math.max(value, minLeft), maxLeft);
  const clampTop = (value: number): number => Math.max(minTop, Math.min(value, maxTop));
  if (anchor.kind === "rect") {
    const { rect } = anchor;
    const above = rect.top - size.height - LINK_POPOVER_MARGIN;
    return {
      left: clampLeft(rect.left + rect.width / 2 - size.width / 2),
      top: clampTop(above >= minTop ? above : rect.top + rect.height + LINK_POPOVER_MARGIN),
    };
  }
  const left = anchor.x + POINTER_LEFT_OFFSET;
  const top = anchor.y + POINTER_TOP_OFFSET;
  return {
    left: clampLeft(left > maxLeft ? anchor.x - size.width - POINTER_LEFT_OFFSET : left),
    top: clampTop(top > maxTop ? anchor.y - size.height - POINTER_TOP_OFFSET : top),
  };
}
