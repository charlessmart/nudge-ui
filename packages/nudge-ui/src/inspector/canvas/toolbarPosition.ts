import { panelWidthTarget } from "../shell/panelWidth.ts";

const OFFSET_X_PROPERTY = "--canvas-toolbar-offset-x";
const OFFSET_Y_PROPERTY = "--canvas-toolbar-offset-y";
/** Keeps a dragged toolbar this far inside the window edges. */
const EDGE_MARGIN = 8;

/** How far the toolbar sits from its default spot, bottom centre. */
export interface ToolbarOffset {
  readonly x: number;
  readonly y: number;
}

export const DEFAULT_TOOLBAR_OFFSET: ToolbarOffset = { x: 0, y: 0 };

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** The offset closest to `wanted` that keeps the toolbar, now at `rect` under `current`, inside the window. */
export function clampToolbarOffset(
  wanted: ToolbarOffset,
  current: ToolbarOffset,
  rect: Pick<DOMRect, "left" | "right" | "top" | "bottom">,
  viewport: { readonly width: number; readonly height: number },
): ToolbarOffset {
  const minX = EDGE_MARGIN - rect.left;
  const maxX = viewport.width - EDGE_MARGIN - rect.right;
  const minY = EDGE_MARGIN - rect.top;
  const maxY = viewport.height - EDGE_MARGIN - rect.bottom;
  // A window too small for the toolbar has no valid range; the default spot is the best answer.
  const dx = minX > maxX ? -current.x : clamp(wanted.x - current.x, minX, maxX);
  const dy = minY > maxY ? -current.y : clamp(wanted.y - current.y, minY, maxY);
  return { x: Math.round(current.x + dx), y: Math.round(current.y + dy) };
}

/** Sets the offset on the inspector's host, so the toolbar and the bars that float above it all follow. */
export function applyToolbarOffset(from: Node, offset: ToolbarOffset): void {
  const target = panelWidthTarget(from);
  if (offset.x === 0 && offset.y === 0) {
    target.style.removeProperty(OFFSET_X_PROPERTY);
    target.style.removeProperty(OFFSET_Y_PROPERTY);
    return;
  }
  target.style.setProperty(OFFSET_X_PROPERTY, `${offset.x}px`);
  target.style.setProperty(OFFSET_Y_PROPERTY, `${offset.y}px`);
}

let sessionOffset: ToolbarOffset = DEFAULT_TOOLBAR_OFFSET;

/**
 * Where the toolbar was left during this page load. Held in memory only, so a refresh puts it back, while the inspector
 * being closed and reopened (which rebuilds its host) does not.
 */
export function rememberToolbarOffset(offset: ToolbarOffset): void {
  sessionOffset = offset;
}

export function rememberedToolbarOffset(): ToolbarOffset {
  return sessionOffset;
}
