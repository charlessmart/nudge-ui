/** Renderer-owned identity that survives DOM reorders for the lifetime of a node. */
export const RENDERER_ELEMENT_ID_ATTR = "data-dt-renderer-id";

export interface CidIndex {
  elementId(el: HTMLElement): string;
}

/**
 * Retains the historical factory name while replacing positional indexes with
 * node identities. IDs are attached to the actual DOM node, so reorders and
 * sibling insertions cannot redirect a delayed controller message.
 */
export function createCidIndex(_doc: Document): CidIndex {
  let nextId = 1;
  const ids = new WeakMap<HTMLElement, string>();

  function elementId(el: HTMLElement): string {
    const existing = ids.get(el);
    if (existing) return existing;
    const id = `r${nextId++}`;
    ids.set(el, id);
    el.setAttribute(RENDERER_ELEMENT_ID_ATTR, id);
    return id;
  }

  return { elementId };
}
