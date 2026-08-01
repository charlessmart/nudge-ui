/**
 * Document-order index from `(data-cid, data-src)` pairs to the ordered list
 * of elements carrying that identity. The index is built lazily on first
 * access and invalidated by a document-wide MutationObserver, so reorders,
 * additions, removals and attribute edits refresh it without scanning the
 * frame document per pointer event.
 */
const KEY_SEPARATOR = "\u0000";

export interface CidIndex {
  instanceIndex(el: HTMLElement): number;
  invalidate(): void;
}

export function createCidIndex(doc: Document): CidIndex {
  let cached: Map<string, HTMLElement[]> | null = null;

  const observer = new MutationObserver(() => {
    cached = null;
  });
  observer.observe(doc, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["data-cid", "data-src"],
  });

  function build(): Map<string, HTMLElement[]> {
    const index = new Map<string, HTMLElement[]>();
    for (const el of doc.querySelectorAll<HTMLElement>("[data-cid]")) {
      const cid = el.getAttribute("data-cid");
      if (!cid) continue;
      const key = cid + KEY_SEPARATOR + (el.getAttribute("data-src") ?? "");
      const list = index.get(key);
      if (list) {
        list.push(el);
      } else {
        index.set(key, [el]);
      }
    }
    return index;
  }

  function instanceIndex(el: HTMLElement): number {
    const cid = el.getAttribute("data-cid");
    if (!cid) return 0;
    if (cached === null) cached = build();
    const key = cid + KEY_SEPARATOR + (el.getAttribute("data-src") ?? "");
    const list = cached.get(key);
    if (!list) return 0;
    return list.indexOf(el);
  }

  function invalidate(): void {
    cached = null;
  }

  return { instanceIndex, invalidate };
}
