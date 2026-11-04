import { MAX_CAMERA_ZOOM, MIN_CAMERA_ZOOM, type CanvasCamera } from "./viewStore.ts";

/** The zoom a full mouse-wheel notch gives. Smaller deltas, such as a trackpad's stream of events, give proportionally less. */
export const ZOOM_WHEEL_FACTOR = 1.25;
/** A typical mouse-wheel notch's deltaY, which also caps one event so a fast or accelerated wheel cannot jump further. */
export const ZOOM_WHEEL_NOTCH = 100;

export interface ClientPoint {
  x: number;
  y: number;
}

export interface ClientRect {
  left: number;
  top: number;
}

/** Zooms to `zoom` about a point on the board, which stays where it is on screen. */
export function zoomCameraAbout(camera: CanvasCamera, zoom: number, point: ClientPoint): CanvasCamera {
  const next = Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, zoom));
  return {
    x: point.x - ((point.x - camera.x) / camera.zoom) * next,
    y: point.y - ((point.y - camera.y) / camera.zoom) * next,
    zoom: next,
  };
}

export function zoomCameraAtPointer(
  camera: CanvasCamera,
  pointer: ClientPoint,
  boardRect: ClientRect,
  deltaY: number,
): CanvasCamera {
  const pointerX = pointer.x - boardRect.left;
  const pointerY = pointer.y - boardRect.top;
  const worldX = (pointerX - camera.x) / camera.zoom;
  const worldY = (pointerY - camera.y) / camera.zoom;
  const clamped = Math.max(-ZOOM_WHEEL_NOTCH, Math.min(ZOOM_WHEEL_NOTCH, deltaY));
  const factor = Math.exp((-clamped / ZOOM_WHEEL_NOTCH) * Math.log(ZOOM_WHEEL_FACTOR));
  const zoom = Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, camera.zoom * factor));

  return {
    x: pointerX - worldX * zoom,
    y: pointerY - worldY * zoom,
    zoom,
  };
}
