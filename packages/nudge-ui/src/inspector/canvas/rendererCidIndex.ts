/** Renderer-owned identity that survives DOM reorders for the lifetime of a node. */
export const RENDERER_ELEMENT_ID_ATTR = "data-renderer-id";

export interface CidIndex {
  elementId(el: HTMLElement): string;
}

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
