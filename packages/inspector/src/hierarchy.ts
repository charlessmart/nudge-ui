function isInsideInspector(el: HTMLElement): boolean {
  if (el.id === "design-tool-root") return true;
  if (el.closest("#design-tool-root")) return true;
  const root = el.getRootNode();
  return root instanceof ShadowRoot && root.host instanceof HTMLElement && root.host.id === "design-tool-root";
}

export function computeHierarchy(el: HTMLElement): HTMLElement[] {
  if (isInsideInspector(el)) return [];
  const chain: HTMLElement[] = [];
  let node: HTMLElement | null = el;
  while (node && node !== document.body && node.tagName !== "BODY") {
    if (node.id === "design-tool-root") break;
    if (node.hasAttribute("data-cid")) chain.push(node);
    node = node.parentElement;
  }
  return chain;
}
