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

export interface DescendantNode {
  element: HTMLElement;
  depth: number;
}

/** Returns the nearest tracked descendants, breadth-first and document-ordered. */
export function computeDescendants(
  el: HTMLElement,
  maxDepth = 2,
  maxNodes = 2,
): DescendantNode[] {
  if (maxDepth < 1 || maxNodes < 1) return [];
  const descendants = Array.from(el.querySelectorAll<HTMLElement>('[data-cid]'))
    .map((element, order) => {
      let depth = 1;
      let ancestor = element.parentElement;
      while (ancestor && ancestor !== el) {
        if (ancestor.hasAttribute('data-cid')) depth += 1;
        ancestor = ancestor.parentElement;
      }
      return ancestor === el ? { element, depth, order } : null;
    })
    .filter((node): node is DescendantNode & { order: number } => node !== null && node.depth <= maxDepth)
    .sort((left, right) => left.depth - right.depth || left.order - right.order);
  return descendants.slice(0, maxNodes).map(({ element, depth }) => ({ element, depth }));
}
