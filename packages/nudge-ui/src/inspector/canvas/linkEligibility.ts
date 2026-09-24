export function findClosestAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  if (target instanceof HTMLAnchorElement) return target;
  return target.closest("a");
}

export function isEligibleNavigation(
  anchor: HTMLAnchorElement,
  event: MouseEvent,
): boolean {
  if (event.ctrlKey || event.metaKey || event.shiftKey) return false;

  if (anchor.hasAttribute("download")) return false;

  if (anchor.target && anchor.target !== "" && anchor.target !== "_self") return false;

  if (anchor.protocol !== "http:" && anchor.protocol !== "https:") return false;

  try {
    const url = new URL(anchor.href);
    if (url.origin !== window.location.origin) return false;
  } catch {
    return false;
  }

  return true;
}

export function hasDifferentRoute(anchor: HTMLAnchorElement): boolean {
  try {
    const url = new URL(anchor.href);
    if (url.pathname !== window.location.pathname) return true;
    if (url.search !== window.location.search) return true;
    return false;
  } catch {
    return false;
  }
}

/**
 * Returns whether the renderer should leave an anchor's browser behavior
 * intact instead of consuming it as an editing click.
 */
export function shouldPreserveNativeLinkActivation(
  anchor: HTMLAnchorElement,
  event: MouseEvent,
): boolean {
  // Command/Ctrl-click is the deep-selection gesture and Shift-click is the
  // additive selection gesture. Neither may navigate or activate the link.
  if (event.metaKey || event.ctrlKey || event.shiftKey) return false;

  if (anchor.hasAttribute("download")) return true;
  if (anchor.target && anchor.target !== "" && anchor.target !== "_self") return true;
  if (anchor.protocol !== "http:" && anchor.protocol !== "https:") return true;

  try {
    const url = new URL(anchor.href);
    if (url.origin !== window.location.origin) return true;
  } catch {
    return true;
  }

  return !hasDifferentRoute(anchor);
}
