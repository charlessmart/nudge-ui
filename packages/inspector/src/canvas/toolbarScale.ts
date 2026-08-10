/**
 * Keep canvas card controls usable while the board is zoomed out without
 * letting them grow without bound relative to the card.
 */
export const CANVAS_TOOLBAR_MAX_SCALE = 2;
export const CANVAS_TOOLBAR_SCALE_CAP_ZOOM = 1 / CANVAS_TOOLBAR_MAX_SCALE;

export function getCanvasToolbarScale(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) return CANVAS_TOOLBAR_MAX_SCALE;
  return Math.min(1 / zoom, CANVAS_TOOLBAR_MAX_SCALE);
}
