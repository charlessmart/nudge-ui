import { MAX_CAMERA_ZOOM } from "./viewStore.ts";
import { CANVAS_TOOLBAR_MAX_SCALE, getCanvasToolbarScale } from "./toolbarScale.ts";

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

/** Set once on the board content: card chrome reads them, so a camera change restyles cards without rendering them. */
export function getCanvasChromeScaleVariables(zoom: number): Record<`--${string}`, number> {
  const toolbarScale = getCanvasToolbarScale(zoom);
  return {
    "--canvas-toolbar-scale": toolbarScale,
    "--canvas-toolbar-inverse-scale": 1 / toolbarScale,
    "--canvas-resize-handle-scale": getCanvasResizeHandleScale(zoom),
  };
}
