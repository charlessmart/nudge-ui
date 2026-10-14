import { getElementWindow } from "../runtime/domRealm.ts";

/** Follows the element's current parent after mutations, since gestures can move it between containers. */
export function observeSelectedGeometry(element: HTMLElement, onChange: () => void): () => void {
  const view = getElementWindow(element);
  // SAFETY: view is a same-realm Window, and the runtime realm exposes the observer constructors as project-wide globals.
  const { ResizeObserver: ResizeObserverCtor, MutationObserver: MutationObserverCtor } = view as typeof window;
  let frame: number | null = null;

  function schedule(): void {
    if (frame !== null) return;
    frame = view.requestAnimationFrame(() => {
      frame = null;
      onChange();
    });
  }

  type ScrollTarget = Window | Document | HTMLElement;
  let scrollTargets: ScrollTarget[] = [];

  function unbindScrollTargets(): void {
    for (const target of scrollTargets) target.removeEventListener("scroll", schedule, true);
    scrollTargets = [];
  }

  function bindScrollTargets(): void {
    unbindScrollTargets();
    const targets: ScrollTarget[] = [view, view.document];
    let ancestor = element.parentElement;
    while (ancestor) {
      targets.push(ancestor);
      ancestor = ancestor.parentElement;
    }
    scrollTargets = [...new Set(targets)];
    for (const target of scrollTargets) target.addEventListener("scroll", schedule, true);
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
      bindScrollTargets();
    }
    schedule();
  }) : null;
  observedParent = element.parentElement;
  if (observedParent) mutationObserver?.observe(observedParent, { childList: true });

  view.addEventListener("resize", schedule);
  bindScrollTargets();

  return () => {
    if (frame !== null) view.cancelAnimationFrame(frame);
    resizeObserver?.disconnect();
    mutationObserver?.disconnect();
    view.removeEventListener("resize", schedule);
    unbindScrollTargets();
  };
}
