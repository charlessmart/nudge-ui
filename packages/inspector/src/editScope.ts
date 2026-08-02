import { escapeAttrValue } from "./cssEscapes.ts";

export type EditScope = "source-site" | "instance-preview";

export interface InstanceEvidence {
  renderedIndex: number;
  props: string | null;
  text: string | null;
}

const INSTANCE_ATTR = "data-dt-instance";
let nextInstanceId = 1;

let sourceSiteMatchCounts = new WeakMap<Document, Map<string, number>>();

/** Test hook: clears the memoized source-site match counts. */
export function resetSourceSiteMatchCounts(): void {
  sourceSiteMatchCounts = new WeakMap();
}

export function sourceSiteSelector(cid: string, src: string): string | null {
  if (!cid) return null;
  if (!src) return `[data-cid="${escapeAttrValue(cid)}"]`;
  // A source site is the complete file:line:column identity injected by the
  // Vite transform. Keeping only file:line makes separate JSX elements on a
  // single formatted line share a managed rule.
  return `[data-cid="${escapeAttrValue(cid)}"][data-src="${escapeAttrValue(src)}"]`;
}

/**
 * Counts the rendered elements matching a source site. The result is memoized
 * per (element identity, scope revision) so the selection render path no longer
 * runs a full-document querySelectorAll on every render; it only recomputes
 * when the caller's scope revision changes.
 */
export function countSourceSiteMatches(el: HTMLElement, revision = 0): number {
  const cid = el.getAttribute("data-cid") ?? "";
  const src = el.getAttribute("data-src") ?? "";
  const instance = el.getAttribute(INSTANCE_ATTR) ?? "";
  const doc = el.ownerDocument ?? document;
  const key = `${cid}\u0000${src}\u0000${instance}\u0000${revision}`;
  let cache = sourceSiteMatchCounts.get(doc);
  if (!cache) {
    cache = new Map();
    sourceSiteMatchCounts.set(doc, cache);
  }
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  const selector = sourceSiteSelector(cid, src);
  let count = 0;
  if (selector) {
    try { count = doc.querySelectorAll(selector).length; } catch { count = 0; }
  }
  if (cache.size >= 4096) cache.clear();
  cache.set(key, count);
  return count;
}

export function unlinkElement(el: HTMLElement): string {
  const existing = el.getAttribute(INSTANCE_ATTR);
  if (existing) return existing;
  const id = `i${nextInstanceId++}`;
  el.setAttribute(INSTANCE_ATTR, id);
  return id;
}

export function relinkElement(el: HTMLElement): void {
  el.removeAttribute(INSTANCE_ATTR);
}

export function getEditScope(el: HTMLElement): EditScope {
  return el.hasAttribute(INSTANCE_ATTR) ? "instance-preview" : "source-site";
}

export function selectorForElement(el: HTMLElement): string | null {
  const instance = el.getAttribute(INSTANCE_ATTR);
  if (instance) {
    const sourceSelector = sourceSiteSelector(
      el.getAttribute("data-cid") ?? "",
      el.getAttribute("data-src") ?? "",
    );
    const instanceSelector = `[${INSTANCE_ATTR}="${escapeAttrValue(instance)}"]`;
    return sourceSelector ? `${sourceSelector}${instanceSelector}` : instanceSelector;
  }
  return sourceSiteSelector(el.getAttribute("data-cid") ?? "", el.getAttribute("data-src") ?? "");
}

export function getInstanceEvidence(el: HTMLElement): InstanceEvidence {
  const selector = sourceSiteSelector(el.getAttribute("data-cid") ?? "", el.getAttribute("data-src") ?? "");
  const matches = selector ? Array.from(el.ownerDocument.querySelectorAll(selector)) : [];
  const renderedIndex = Math.max(0, matches.indexOf(el));
  const text = el.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) || null;
  return { renderedIndex, props: el.getAttribute("data-cprops"), text };
}
