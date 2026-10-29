export function findClosestAnchor(target: EventTarget | null): HTMLAnchorElement | null {
  if (!(target instanceof Element)) return null;
  if (target instanceof HTMLAnchorElement) return target;
  return target.closest("a");
}

export function isEligibleLink(anchor: HTMLAnchorElement): boolean {
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

export function isEligibleNavigation(
  anchor: HTMLAnchorElement,
  event: MouseEvent,
): boolean {
  if (event.ctrlKey || event.metaKey || event.shiftKey) return false;

  return isEligibleLink(anchor);
}

/** Hover previews only offer routes that would actually change the frame's page. */
export function isLinkPreviewTarget(anchor: HTMLAnchorElement): boolean {
  return isEligibleLink(anchor) && hasDifferentRoute(anchor);
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
