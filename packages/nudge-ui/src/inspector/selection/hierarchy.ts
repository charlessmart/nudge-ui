import { isShadowRootInDocument } from "../runtime/domRealm.ts";
import { canTagRuntimeSubtree } from "../runtime/staticHtmlRuntimeIdentity.ts";

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

/** Direct children listed in the layer tree before the rest collapse into a count. */
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

/** Any element child the tree could list, whether or not it has identity yet. */
function hasElementChildren(el: HTMLElement): boolean {
  const view = el.ownerDocument.defaultView;
  const constructor = view?.HTMLElement ?? null;
  const svgConstructor = view?.SVGElement ?? null;
  if (!constructor && !svgConstructor) return false;
  for (const child of el.children) {
    if (isTrackableChild(child, constructor, svgConstructor)) return true;
  }
  return false;
}

/**
 * Whether a row shows a disclosure control. Built apps answer from identity alone; a live page tags lazily,
 * so there an untagged child still earns one, and opening the row gives that child its identity.
 */
export function hasExpandableChildren(el: HTMLElement): boolean {
  if (hasTrackedChildren(el)) return true;
  return canTagRuntimeSubtree(el) && hasElementChildren(el);
}

/** Nearest tracked ancestors, fewer when children also fill the menu. */
export function computeNavigationParents(hierarchy: readonly HTMLElement[], hasChildren: boolean): HTMLElement[] {
  return hierarchy.slice(1, (hasChildren ? 2 : 4) + 1);
}
