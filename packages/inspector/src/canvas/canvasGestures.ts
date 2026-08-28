import {
  MAX_CAMERA_ZOOM,
  MIN_CAMERA_ZOOM,
  type CanvasCamera,
} from "./canvasStore.ts";

export const ZOOM_WHEEL_FACTOR = 1.04;

export interface ClientPoint {
  x: number;
  y: number;
}

export interface ClientRect {
  left: number;
  top: number;
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
  const factor = deltaY < 0 ? ZOOM_WHEEL_FACTOR : 1 / ZOOM_WHEEL_FACTOR;
  const zoom = Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, camera.zoom * factor));

  return {
    x: pointerX - worldX * zoom,
    y: pointerY - worldY * zoom,
    zoom,
  };
}

export function iframePointToClientPoint(
  iframeRect: ClientRect,
  point: ClientPoint,
  cameraZoom: number,
): ClientPoint {
  return {
    x: iframeRect.left + point.x * cameraZoom,
    y: iframeRect.top + point.y * cameraZoom,
  };
}
