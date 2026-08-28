import { isShadowRootInDocument } from "./domRealm.ts";

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
