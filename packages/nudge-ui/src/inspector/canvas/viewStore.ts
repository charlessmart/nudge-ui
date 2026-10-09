import { useSyncExternalStore } from "react";

export type CanvasMode = "inspect" | "canvas";
export type CanvasPresentation = "focus" | "canvas";

export interface CanvasCamera {
  x: number;
  y: number;
  zoom: number;
}

export const MIN_CAMERA_ZOOM = 0.25;
export const MAX_CAMERA_ZOOM = 3;
export const DEFAULT_CAMERA: CanvasCamera = { x: 0, y: 0, zoom: 1 };

/** How the canvas is viewed. Frames, groups, and selection live in the canvas store. */
let mode: CanvasMode = "inspect";
let presentation: CanvasPresentation = "focus";
let presentationTransitioning = false;
let presentationTransitionTimer: number | null = null;
let layoutTransitioning = false;
let temporaryAppInteraction = false;
let camera: CanvasCamera = { ...DEFAULT_CAMERA };
let cameraPlaced = false;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeCanvasView(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function clampZoom(zoom: number): number {
  return Math.max(MIN_CAMERA_ZOOM, Math.min(MAX_CAMERA_ZOOM, zoom));
}

export function getCanvasMode(): CanvasMode { return mode; }

export function setCanvasMode(next: CanvasMode): void {
  if (mode === next) return;
  mode = next;
  notify();
}

export function getCanvasPresentation(): CanvasPresentation { return presentation; }

export function setCanvasPresentation(next: CanvasPresentation): void {
  if (presentation === next) return;
  presentation = next;
  presentationTransitioning = !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (presentationTransitionTimer !== null) window.clearTimeout(presentationTransitionTimer);
  presentationTransitionTimer = presentationTransitioning
    ? window.setTimeout(() => {
      presentationTransitionTimer = null;
      presentationTransitioning = false;
      notify();
    }, 220)
    : null;
  notify();
}

/** Holding A temporarily enables app interaction without changing the selected tool. */
export function setTemporaryAppInteraction(value: boolean): void {
  if (temporaryAppInteraction === value) return;
  temporaryAppInteraction = value;
  notify();
}

/** Element interactions pause while frame and camera geometry are animated. */
export function setCanvasLayoutTransitioning(value: boolean): void {
  if (layoutTransitioning === value) return;
  layoutTransitioning = value;
  notify();
}

export function getCanvasLayoutTransitioning(): boolean { return layoutTransitioning; }

export function getBoardCamera(): CanvasCamera { return camera; }

export function setBoardCamera(next: CanvasCamera): void {
  camera = { x: next.x, y: next.y, zoom: clampZoom(next.zoom) };
  notify();
}

export function updateBoardCamera(partial: Partial<CanvasCamera>): void {
  setBoardCamera({ ...camera, ...partial });
}

/** Moves the camera to frame content; the initial fit-all then no longer runs. */
export function placeBoardCamera(next: CanvasCamera): void {
  cameraPlaced = true;
  setBoardCamera(next);
}

export function hasFitAllRan(): boolean { return cameraPlaced; }

export function resetFitAllFlag(): void { cameraPlaced = false; }

export function restoreCanvasView(next: { mode: CanvasMode; presentation: CanvasPresentation; camera: CanvasCamera }): void {
  mode = next.mode;
  presentation = next.presentation;
  camera = { ...next.camera };
  cameraPlaced = true;
  notify();
}

export function useCanvasMode(): CanvasMode {
  return useSyncExternalStore(subscribeCanvasView, getCanvasMode, getCanvasMode);
}

export function useCanvasPresentation(): CanvasPresentation {
  return useSyncExternalStore(subscribeCanvasView, getCanvasPresentation, getCanvasPresentation);
}

export function useCanvasPresentationTransitioning(): boolean {
  return useSyncExternalStore(subscribeCanvasView, () => presentationTransitioning, () => presentationTransitioning);
}

export function useTemporaryAppInteraction(): boolean {
  return useSyncExternalStore(subscribeCanvasView, () => temporaryAppInteraction, () => temporaryAppInteraction);
}

export function useCanvasLayoutTransitioning(): boolean {
  return useSyncExternalStore(subscribeCanvasView, getCanvasLayoutTransitioning, getCanvasLayoutTransitioning);
}

export function useBoardCamera(): CanvasCamera {
  return useSyncExternalStore(subscribeCanvasView, getBoardCamera, getBoardCamera);
}
