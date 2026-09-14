import { MAX_CAMERA_ZOOM } from "./canvasStore.ts";
import { CANVAS_TOOLBAR_MAX_SCALE } from "./toolbarScale.ts";

/**
 * Keep the resize handle usable while the board is zoomed without allowing
 * inverse scaling to make it disproportionately large or small.
 */
export const CANVAS_RESIZE_HANDLE_MIN_SCALE = 1 / MAX_CAMERA_ZOOM;
export const CANVAS_RESIZE_HANDLE_MAX_SCALE = CANVAS_TOOLBAR_MAX_SCALE;

/**
 * Returns the scale to apply inside the board's zoomed coordinate space.
 *
 * The lower bound matches the inverse of the largest supported camera zoom,
 * and the upper bound follows the toolbar compensation policy.
 */
export function getCanvasResizeHandleScale(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return CANVAS_RESIZE_HANDLE_MAX_SCALE;
  }

  return Math.max(
    CANVAS_RESIZE_HANDLE_MIN_SCALE,
    Math.min(1 / zoom, CANVAS_RESIZE_HANDLE_MAX_SCALE),
  );
}
