import { MAX_CAMERA_ZOOM } from "./viewStore.ts";
import { CANVAS_TOOLBAR_MAX_SCALE } from "./toolbarScale.ts";

/** Keeps the resize handle usable at any zoom without letting inverse scaling make it disproportionately large or small. */
export const CANVAS_RESIZE_HANDLE_MIN_SCALE = 1 / MAX_CAMERA_ZOOM;
export const CANVAS_RESIZE_HANDLE_MAX_SCALE = CANVAS_TOOLBAR_MAX_SCALE;

export function getCanvasResizeHandleScale(zoom: number): number {
  if (!Number.isFinite(zoom) || zoom <= 0) {
    return CANVAS_RESIZE_HANDLE_MAX_SCALE;
  }

  return Math.max(
    CANVAS_RESIZE_HANDLE_MIN_SCALE,
    Math.min(1 / zoom, CANVAS_RESIZE_HANDLE_MAX_SCALE),
  );
}
