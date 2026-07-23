/** DOM operations for elements that may belong to a same-origin Canvas frame. */
export function getElementWindow(element: Element): Window {
  return element.ownerDocument.defaultView ?? window;
}

export function getElementComputedStyle(element: Element): CSSStyleDeclaration {
  return getElementWindow(element).getComputedStyle(element);
}

export function isShadowRootInDocument(root: Node, doc: Document): root is ShadowRoot {
  const ShadowRootConstructor = doc.defaultView?.ShadowRoot;
  return ShadowRootConstructor !== undefined && root instanceof ShadowRootConstructor;
}
