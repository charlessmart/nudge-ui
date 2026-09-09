import { getElementWindow } from "../runtime/domRealm.ts";

/**
 * Watches the small set of browser events that can change a selected element's
 * viewport rect without changing its selection identity. Structural gestures
 * can move a selected element between containers, so the child-list observer
 * follows the element's current parent after each mutation.
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

  let observedParent: HTMLElement | null = null;
  const mutationObserver = MutationObserverCtor ? new MutationObserverCtor(() => {
    const currentParent = element.parentElement;
    if (currentParent !== observedParent) {
      observedParent = currentParent;
      mutationObserver?.disconnect();
      if (observedParent) mutationObserver?.observe(observedParent, { childList: true });
    }
    schedule();
  }) : null;
  observedParent = element.parentElement;
  if (observedParent) mutationObserver?.observe(observedParent, { childList: true });

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
