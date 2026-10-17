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

function htmlElementConstructor(el: HTMLElement): typeof HTMLElement | null {
  return el.ownerDocument.defaultView?.HTMLElement ?? null;
}

/** The nearest tracked elements below `el` in document order, looking through untracked wrappers. */
export function computeTrackedChildren(el: HTMLElement, limit = NAVIGATOR_CHILD_LIMIT): TrackedChildren {
  const constructor = htmlElementConstructor(el);
  const result: TrackedChildren = { elements: [], hidden: 0 };
  if (!constructor) return result;
  const visit = (parent: Element): void => {
    for (const child of parent.children) {
      if (!(child instanceof constructor)) continue;
      if (!child.hasAttribute("data-cid")) visit(child);
      else if (result.elements.length < limit) result.elements.push(child);
      else result.hidden += 1;
    }
  };
  visit(el);
  return result;
}

export function hasTrackedChildren(el: HTMLElement): boolean {
  const constructor = htmlElementConstructor(el);
  if (!constructor) return false;
  const visit = (parent: Element): boolean => {
    for (const child of parent.children) {
      if (!(child instanceof constructor)) continue;
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
