import { getRenderedInstanceOverride, createRenderedInstanceOverride, clearRenderedInstanceOverride } from "./renderedInstance.ts";
import { sourceSiteSelector } from "./sourceSite.ts";

export { sourceSiteSelector } from "./sourceSite.ts";

export type EditScope = "source-site" | "rendered-instance";

export interface InstanceEvidence {
  renderedIndex: number;
  props: string | null;
  text: string | null;
  ariaLabel: string | null;
}

let sourceSiteMatchCounts = new WeakMap<Document, WeakMap<HTMLElement, Map<string, number>>>();

/** Test hook: clears the memoized source-site match counts. */
export function resetSourceSiteMatchCounts(): void {
  sourceSiteMatchCounts = new WeakMap();
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
  const doc = el.ownerDocument ?? document;
  const key = `${cid}\u0000${src}\u0000${revision}`;
  let documentCache = sourceSiteMatchCounts.get(doc);
  if (!documentCache) {
    documentCache = new WeakMap();
    sourceSiteMatchCounts.set(doc, documentCache);
  }
  let cache = documentCache.get(el);
  if (!cache) {
    cache = new Map();
    documentCache.set(el, cache);
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

export function unlinkElement(el: HTMLElement): string | null {
  return getRenderedInstanceOverride(el)?.id ?? createRenderedInstanceOverride(el)?.id ?? null;
}

export function relinkElement(el: HTMLElement): string | null {
  return clearRenderedInstanceOverride(el)?.id ?? null;
}

export function getEditScope(el: HTMLElement): EditScope {
  return getRenderedInstanceOverride(el) ? "rendered-instance" : "source-site";
}

export function selectorForElement(el: HTMLElement): string | null {
  return sourceSiteSelector(el.getAttribute("data-cid") ?? "", el.getAttribute("data-src") ?? "");
}

export function getInstanceEvidence(el: HTMLElement): InstanceEvidence {
  const selector = sourceSiteSelector(el.getAttribute("data-cid") ?? "", el.getAttribute("data-src") ?? "");
  const matches = selector ? Array.from(el.ownerDocument.querySelectorAll(selector)) : [];
  const renderedIndex = Math.max(0, matches.indexOf(el));
  const text = el.textContent?.replace(/\s+/g, " ").trim().slice(0, 120) || null;
  return { renderedIndex, props: el.getAttribute("data-cprops"), text, ariaLabel: el.getAttribute("aria-label") };
}
