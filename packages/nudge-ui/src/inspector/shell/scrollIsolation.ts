const LINE_HEIGHT = 16;

function isScrollable(element: HTMLElement): boolean {
  const overflowY = getComputedStyle(element).overflowY;
  return (overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight;
}

/** The closest inspector element that can consume the wheel gesture, from the event target upwards. */
function nearestScroller(path: readonly EventTarget[]): HTMLElement | null {
  for (const node of path) {
    if (node instanceof HTMLElement && isScrollable(node)) return node;
  }
  return null;
}

/**
 * The inspected page may lock its own scrolling with a wheel listener. Keep inspector wheel gestures from
 * reaching the page, and move the nearest inspector scroller by hand when the page has already cancelled
 * the event before the inspector sees it.
 */
export function isolateInspectorWheel(root: ShadowRoot): () => void {
  const onWheel: EventListener = (event) => {
    const wheel = event as WheelEvent;
    wheel.stopPropagation();
    if (!wheel.defaultPrevented) return;
    const scroller = nearestScroller(wheel.composedPath());
    if (!scroller) return;
    const scale = wheel.deltaMode === 1
      ? LINE_HEIGHT
      : wheel.deltaMode === 2 ? scroller.clientHeight : 1;
    scroller.scrollTop += wheel.deltaY * scale;
    scroller.scrollLeft += wheel.deltaX * scale;
  };
  root.addEventListener("wheel", onWheel, { passive: true });
  return () => root.removeEventListener("wheel", onWheel);
}
