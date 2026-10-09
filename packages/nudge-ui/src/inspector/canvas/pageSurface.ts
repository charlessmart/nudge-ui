import { NUDGE_UI_MOUNT_ID } from "../../transport/routes.ts";
import type { CanvasFrame } from "./canvasFrame.ts";

let pageSurface = false;

/**
 * Runs the renderer and controller in the inspected window. The single Canvas
 * card is the page itself, so no iframe or framing permission is needed.
 */
export function enablePageSurface(): void {
  pageSurface = true;
}

export function isPageSurface(): boolean {
  return pageSurface;
}

const pageFrames = new WeakMap<Window, CanvasFrame>();

/** The page-surface card's frame: the inspected window, filling the viewport. */
export function getPageFrame(win: Window = window): CanvasFrame {
  const existing = pageFrames.get(win);
  if (existing) return existing;
  const root = win.document.documentElement;
  const frame: CanvasFrame = {
    contentWindow: win,
    contentDocument: win.document,
    isConnected: true,
    get clientWidth() { return root.clientWidth; },
    get clientHeight() { return root.clientHeight; },
    getBoundingClientRect: () => new DOMRect(0, 0, root.clientWidth, root.clientHeight),
  };
  pageFrames.set(win, frame);
  return frame;
}

/** True for events that start inside the inspector's own shadow root. */
export function isInspectorUiEvent(event: Event): boolean {
  return pageSurface && event.composedPath().some((node) => node instanceof Element && node.id === NUDGE_UI_MOUNT_ID);
}
