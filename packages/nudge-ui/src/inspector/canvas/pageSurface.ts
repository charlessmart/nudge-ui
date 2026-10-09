import { NUDGE_UI_MOUNT_ID } from "../../transport/routes.ts";
import { CANVAS_RENDERER_ATTR } from "./roleDetection.ts";

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

const pageFrames = new WeakMap<Window, HTMLIFrameElement>();

/**
 * Stands in for the renderer iframe. Controller code reads geometry, the
 * document, and the window from it; the page always fills the viewport.
 */
export function getPageFrame(win: Window = window): HTMLIFrameElement {
  const existing = pageFrames.get(win);
  if (existing) return existing;
  const doc = win.document;
  const viewportWidth = () => doc.documentElement.clientWidth;
  const viewportHeight = () => doc.documentElement.clientHeight;
  // SAFETY: Every iframe member the controller reads is defined below; the
  // prototype only makes `instanceof HTMLIFrameElement` checks pass.
  const frame = Object.create((win as Window & typeof globalThis).HTMLIFrameElement.prototype) as HTMLIFrameElement;
  Object.defineProperties(frame, {
    contentWindow: { get: () => win },
    contentDocument: { get: () => doc },
    ownerDocument: { get: () => doc },
    isConnected: { get: () => true },
    clientWidth: { get: viewportWidth },
    clientHeight: { get: viewportHeight },
    src: { get: () => win.location.href, set: () => undefined },
    getBoundingClientRect: { value: () => new DOMRect(0, 0, viewportWidth(), viewportHeight()) },
    hasAttribute: { value: (name: string) => name === CANVAS_RENDERER_ATTR },
    getAttribute: { value: (name: string) => (name === "src" ? win.location.href : name === CANVAS_RENDERER_ATTR ? "" : null) },
    setAttribute: { value: () => undefined },
    addEventListener: { value: () => undefined },
    removeEventListener: { value: () => undefined },
    focus: { value: () => undefined },
  });
  pageFrames.set(win, frame);
  return frame;
}

/** True for events that start inside the inspector's own shadow root. */
export function isInspectorUiEvent(event: Event): boolean {
  return pageSurface && event.composedPath().some((node) => node instanceof Element && node.id === NUDGE_UI_MOUNT_ID);
}
