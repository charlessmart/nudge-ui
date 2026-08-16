import { getElementWindow } from "./domRealm.ts";

/**
 * Watches the small set of browser events that can change a selected element's
 * viewport rect without changing its selection identity. Structural gestures
 * only reorder siblings, so observing the immediate parent is sufficient and
 * avoids a document-wide mutation observer.
 */
export function observeSelectedGeometry(element: HTMLElement, onChange: () => void): () => void {
  const view = getElementWindow(element);
  // getElementWindow returns the cross-realm Window interface, while the
  // project-wide browser global also carries the observer constructors.
  const { ResizeObserver: ResizeObserverCtor, MutationObserver: MutationObserverCtor } = view as typeof window;
  let frame: number | null = null;

  function schedule(): void {
    if (frame !== null) return;
    frame = view.requestAnimationFrame(() => {
      frame = null;
      onChange();
    });
  }

  const resizeObserver = ResizeObserverCtor
    ? new ResizeObserverCtor(schedule)
    : null;
  resizeObserver?.observe(element);

  const parent = element.parentElement;
  const mutationObserver = parent && MutationObserverCtor
    ? new MutationObserverCtor(schedule)
    : null;
  if (parent) mutationObserver?.observe(parent, { childList: true });

  view.addEventListener("resize", schedule);
  view.addEventListener("scroll", schedule, true);

  return () => {
    if (frame !== null) view.cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    view.removeEventListener("resize", schedule);
    view.removeEventListener("scroll", schedule, true);
  };
}
