import type { SketchViewport } from "./viewport.ts";

type WheelLike = Pick<WheelEvent, "clientX" | "clientY" | "deltaX" | "deltaY" | "deltaMode" | "shiftKey">;

const LINE_HEIGHT_PX = 16;

/** The wheel's travel in pixels, with a shift-wheel turned sideways as the browser does. */
export function wheelDeltaPixels(event: WheelLike, viewport: Pick<SketchViewport, "width" | "height">): { x: number; y: number } {
  const xUnit = event.deltaMode === 1 ? LINE_HEIGHT_PX : event.deltaMode === 2 ? viewport.width : 1;
  const yUnit = event.deltaMode === 1 ? LINE_HEIGHT_PX : event.deltaMode === 2 ? viewport.height : 1;
  const x = event.deltaX * xUnit;
  const y = event.deltaY * yUnit;
  return event.shiftKey && x === 0 ? { x: y, y: 0 } : { x, y };
}

function canScroll(element: Element, view: Window, axis: "x" | "y", delta: number): boolean {
  if (delta === 0) return false;
  const style = view.getComputedStyle(element);
  const overflow = axis === "x" ? style.overflowX : style.overflowY;
  if (overflow !== "auto" && overflow !== "scroll") return false;
  const [position, size, extent] = axis === "x"
    ? [element.scrollLeft, element.clientWidth, element.scrollWidth]
    : [element.scrollTop, element.clientHeight, element.scrollHeight];
  return delta > 0 ? position + size < extent - 1 : position > 0;
}

/**
 * The sketch surface sits over the frame and takes the wheel, so the scroll is passed on to what lies beneath: the nearest scrollable element under the pointer, or else the frame itself.
 */
export function forwardSketchWheel(hostElement: HTMLElement, viewport: SketchViewport, event: WheelLike): void {
  const frameWindow = hostElement.ownerDocument.defaultView;
  const iframe = typeof HTMLIFrameElement !== "undefined" && hostElement instanceof HTMLIFrameElement ? hostElement : null;
  const view = iframe?.contentWindow ?? frameWindow;
  if (!view) return;
  const delta = wheelDeltaPixels(event, viewport);
  if (delta.x === 0 && delta.y === 0) return;

  if (iframe?.contentDocument) {
    // The frame may be scaled on the board, so the pointer is mapped into the frame's own pixels.
    const scale = viewport.width / Math.max(1, viewport.displayWidth);
    let element: Element | null = iframe.contentDocument.elementFromPoint(
      (event.clientX - viewport.offsetX) * scale,
      (event.clientY - viewport.offsetY) * scale,
    );
    while (element && element !== iframe.contentDocument.documentElement) {
      const horizontal = canScroll(element, view, "x", delta.x);
      const vertical = canScroll(element, view, "y", delta.y);
      if (horizontal || vertical) {
        element.scrollBy({ left: horizontal ? delta.x : 0, top: vertical ? delta.y : 0, behavior: "instant" });
        return;
      }
      element = element.parentElement;
    }
  }
  // Instant: a page with smooth scrolling would otherwise restart its animation on every wheel tick.
  view.scrollBy({ left: delta.x, top: delta.y, behavior: "instant" });
}
