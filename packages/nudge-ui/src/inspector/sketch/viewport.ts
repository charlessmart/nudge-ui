export interface SketchViewport {
  readonly width: number;
  readonly height: number;
  readonly scrollX: number;
  readonly scrollY: number;
  /** Screen-space placement of the renderer iframe inside the editor. */
  readonly offsetX: number;
  readonly offsetY: number;
  readonly displayWidth: number;
  readonly displayHeight: number;
}

interface SketchSurface {
  readonly document: Document;
  readonly window: Window;
  readonly iframe: HTMLIFrameElement | null;
}

export interface SketchScrollPosition {
  readonly x: number;
  readonly y: number;
}

function nonNegativeOffset(...values: readonly number[]): number {
  return Math.max(0, ...values.filter((value) => Number.isFinite(value)));
}

/** Browsers expose root scrolling through different APIs. */
export function getSketchScrollPosition(targetWindow: Window): SketchScrollPosition {
  const targetDocument = targetWindow.document;
  const scrollingElement = targetDocument.scrollingElement;
  return {
    x: nonNegativeOffset(
      targetWindow.scrollX,
      targetWindow.pageXOffset,
      scrollingElement?.scrollLeft ?? 0,
      targetDocument.documentElement?.scrollLeft ?? 0,
      targetDocument.body?.scrollLeft ?? 0,
    ),
    y: nonNegativeOffset(
      targetWindow.scrollY,
      targetWindow.pageYOffset,
      scrollingElement?.scrollTop ?? 0,
      targetDocument.documentElement?.scrollTop ?? 0,
      targetDocument.body?.scrollTop ?? 0,
    ),
  };
}

function getSketchSurface(hostElement: HTMLElement): SketchSurface {
  const iframe = typeof HTMLIFrameElement !== "undefined" && hostElement instanceof HTMLIFrameElement
    ? hostElement
    : null;
  if (iframe?.contentDocument && iframe.contentWindow) {
    return { document: iframe.contentDocument, window: iframe.contentWindow, iframe };
  }
  const ownerDocument = hostElement.ownerDocument ?? document;
  return {
    document: ownerDocument,
    window: ownerDocument.defaultView ?? window,
    iframe: null,
  };
}

/** The window whose page the host shows: a card's frame, or the inspected page itself. */
export function sketchHostWindow(hostElement: HTMLElement): Window | null {
  if (typeof HTMLIFrameElement !== "undefined" && hostElement instanceof HTMLIFrameElement) return hostElement.contentWindow;
  return hostElement.ownerDocument.defaultView;
}

export function getSketchViewport(hostElement: HTMLElement): SketchViewport {
  const surface = getSketchSurface(hostElement);
  const scroll = getSketchScrollPosition(surface.window);
  if (surface.iframe) {
    const rect = surface.iframe.getBoundingClientRect();
    return {
      width: Math.max(1, Math.round(surface.window.innerWidth || surface.iframe.clientWidth || rect.width)),
      height: Math.max(1, Math.round(surface.window.innerHeight || surface.iframe.clientHeight || rect.height)),
      scrollX: scroll.x,
      scrollY: scroll.y,
      offsetX: rect.left,
      offsetY: rect.top,
      displayWidth: Math.max(1, rect.width),
      displayHeight: Math.max(1, rect.height),
    };
  }
  // The whole window, whichever side the panel docks to: marks are in the page's own coordinates and the panel covers
  // them like any other overlay, so moving it never moves them.
  const width = Math.max(1, Math.round(surface.window.innerWidth));
  const height = Math.max(1, Math.round(surface.window.innerHeight));
  return {
    width,
    height,
    scrollX: scroll.x,
    scrollY: scroll.y,
    offsetX: 0,
    offsetY: 0,
    displayWidth: width,
    displayHeight: height,
  };
}
