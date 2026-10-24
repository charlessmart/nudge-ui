import { isShadowRootInDocument } from "../runtime/domRealm.ts";

function isInsideInspector(el: HTMLElement): boolean {
  if (el.id === "nudge-ui-root") return true;
  if (el.closest("#nudge-ui-root")) return true;
  const root = el.getRootNode();
  return isShadowRootInDocument(root, el.ownerDocument) && root.host.id === "nudge-ui-root";
}

export function computeHierarchy(el: HTMLElement): HTMLElement[] {
  if (isInsideInspector(el)) return [];
  const chain: HTMLElement[] = [];
  let node: HTMLElement | null = el;
  while (node && node !== el.ownerDocument.body && node.tagName !== "BODY") {
    if (node.id === "nudge-ui-root") break;
    if (node.hasAttribute("data-cid")) chain.push(node);
    node = node.parentElement;
  }
  return chain;
}

/** Direct children listed in the DOM navigator before the rest collapse into a count. */
export const NAVIGATOR_CHILD_LIMIT = 50;

export interface TrackedChildren {
  elements: HTMLElement[];
  /** Tracked children past the limit. */
  hidden: number;
}

function isTrackableChild(child: Element, html: typeof HTMLElement | null, svg: typeof SVGElement | null): boolean {
  return Boolean((html && child instanceof html) || (svg && child instanceof svg));
}

function asTrackedElement(element: Element): HTMLElement {
  // SAFETY: an SVG root shares the selection surface's identity, layout and containment APIs.
  return element as HTMLElement;
}

/** The nearest tracked elements below `el` in document order, looking through untracked wrappers. */
export function computeTrackedChildren(el: HTMLElement, limit = NAVIGATOR_CHILD_LIMIT): TrackedChildren {
  const view = el.ownerDocument.defaultView;
  const constructor = view?.HTMLElement ?? null;
  const svgConstructor = view?.SVGElement ?? null;
  const result: TrackedChildren = { elements: [], hidden: 0 };
  if (!constructor && !svgConstructor) return result;
  const visit = (parent: Element): void => {
    for (const child of parent.children) {
      if (!isTrackableChild(child, constructor, svgConstructor)) continue;
      if (!child.hasAttribute("data-cid")) visit(child);
      else if (result.elements.length < limit) result.elements.push(asTrackedElement(child));
      else result.hidden += 1;
    }
  };
  visit(el);
  return result;
}

export function hasTrackedChildren(el: HTMLElement): boolean {
  const view = el.ownerDocument.defaultView;
  const constructor = view?.HTMLElement ?? null;
  const svgConstructor = view?.SVGElement ?? null;
  if (!constructor && !svgConstructor) return false;
  const visit = (parent: Element): boolean => {
    for (const child of parent.children) {
      if (!isTrackableChild(child, constructor, svgConstructor)) continue;
      if (child.hasAttribute("data-cid") || visit(child)) return true;
    }
    return false;
  };
  return visit(el);
}

/** Nearest tracked ancestors, fewer when children also fill the menu. */
export function computeNavigationParents(hierarchy: readonly HTMLElement[], hasChildren: boolean): HTMLElement[] {
  return hierarchy.slice(1, (hasChildren ? 2 : 4) + 1);
}
