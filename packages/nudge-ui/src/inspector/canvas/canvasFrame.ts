/** The renderer behind a Canvas card (its iframe) or the page surface (the inspected window). */
export interface CanvasFrame {
  readonly contentWindow: Window | null;
  readonly contentDocument: Document | null;
  readonly isConnected: boolean;
  readonly clientWidth: number;
  readonly clientHeight: number;
  getBoundingClientRect(): DOMRect;
}

export function canvasFrameElement(frame: CanvasFrame): HTMLIFrameElement | null {
  return typeof HTMLIFrameElement !== "undefined" && frame instanceof HTMLIFrameElement ? frame : null;
}

/** What sketch capture measures: the iframe, or the page's root element. */
export function canvasFrameHost(frame: CanvasFrame | null): HTMLElement | null {
  if (!frame) return null;
  return canvasFrameElement(frame) ?? frame.contentDocument?.documentElement ?? null;
}
