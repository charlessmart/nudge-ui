/**
 * The renderer behind a Canvas card, as controller code sees it. Cards on the
 * Canvas pass their iframe; the page surface passes the inspected window.
 */
export interface CanvasFrame {
  readonly contentWindow: Window | null;
  readonly contentDocument: Document | null;
  readonly isConnected: boolean;
  readonly clientWidth: number;
  readonly clientHeight: number;
  getBoundingClientRect(): DOMRect;
}

/** The card's iframe element, or null for the page surface. */
export function canvasFrameElement(frame: CanvasFrame): HTMLIFrameElement | null {
  return typeof HTMLIFrameElement !== "undefined" && frame instanceof HTMLIFrameElement ? frame : null;
}

/** The element sketch capture measures: the iframe, or the page's root element. */
export function canvasFrameHost(frame: CanvasFrame | null): HTMLElement | null {
  if (!frame) return null;
  return canvasFrameElement(frame) ?? frame.contentDocument?.documentElement ?? null;
}
