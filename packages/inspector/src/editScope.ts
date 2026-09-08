import {
  getRenderedInstanceOverride,
  createRenderedInstanceOverride,
  buildRenderedInstanceOverride,
  clearRenderedInstanceOverride,
  resolveRenderedInstance,
  type RenderedInstanceOverride,
} from "./renderedInstance.ts";
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

function querySourceSiteMatches(el: HTMLElement): number {
  const cid = el.getAttribute("data-cid") ?? "";
  const src = el.getAttribute("data-src") ?? "";
  const selector = sourceSiteSelector(cid, src);
  if (!selector) return 0;
  const doc = el.ownerDocument ?? document;
  try { return doc.querySelectorAll(selector).length; } catch { return 0; }
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
  const count = querySourceSiteMatches(el);
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

export interface BatchScopeFields {
  scope: EditScope;
  instanceOverride?: RenderedInstanceOverride;
}

/**
 * Calculates how many rendered nodes a group edit can affect without creating
 * any instance overrides. This is used for the panel's reach summary; the
 * actual edit path plans all scopes together when it commits declarations.
 */
export function countBatchEditReach(selectedElements: readonly HTMLElement[]): number {
  if (selectedElements.length <= 1) return selectedElements.length;
  const sourceGroups = new Map<string, { element: HTMLElement; selected: number; total: number }>();
  let instanceCount = 0;

  for (const element of selectedElements) {
    if (getRenderedInstanceOverride(element)) {
      instanceCount += 1;
      continue;
    }
    const selector = selectorForElement(element);
    if (!selector) {
      instanceCount += 1;
      continue;
    }
    const group = sourceGroups.get(selector);
    if (group) {
      group.selected += 1;
      continue;
    }
    sourceGroups.set(selector, {
      element,
      selected: 1,
      total: querySourceSiteMatches(element),
    });
  }

  return instanceCount + [...sourceGroups.values()].reduce((reach, group) => {
    if (group.total <= 1 || group.selected >= group.total) return reach + group.total;
    return reach + group.selected;
  }, 0);
}

/**
 * Plans the scope for every target in a batch edit without mutating the DOM or
 * transient instance state. A partial repeated-source group is editable only
 * when each selected output has evidence that resolves uniquely.
 */
export function planBatchEditScopes(
  selectedElements: readonly HTMLElement[],
): ReadonlyMap<HTMLElement, BatchScopeFields> | null {
  const plan = new Map<HTMLElement, BatchScopeFields>();
  if (selectedElements.length <= 1) {
    for (const element of selectedElements) {
      const existing = getRenderedInstanceOverride(element);
      plan.set(element, existing
        ? { scope: "rendered-instance", instanceOverride: existing }
        : { scope: "source-site" });
    }
    return plan;
  }

  const selectedBySource = new Map<string, number>();
  for (const element of selectedElements) {
    const selector = selectorForElement(element);
    if (selector) selectedBySource.set(selector, (selectedBySource.get(selector) ?? 0) + 1);
  }

  for (const element of selectedElements) {
    const existing = getRenderedInstanceOverride(element);
    if (existing) {
      plan.set(element, { scope: "rendered-instance", instanceOverride: existing });
      continue;
    }
    const selector = selectorForElement(element);
    if (!selector) {
      plan.set(element, { scope: "source-site" });
      continue;
    }
    const selectedForSource = selectedBySource.get(selector) ?? 0;
    const totalForSource = querySourceSiteMatches(element);
    if (totalForSource <= 1 || selectedForSource >= totalForSource) {
      plan.set(element, { scope: "source-site" });
      continue;
    }

    const instanceOverride = buildRenderedInstanceOverride(element);
    if (!instanceOverride) return null;
    const resolution = resolveRenderedInstance(element.ownerDocument, instanceOverride.target);
    if (resolution.status !== "resolved" || resolution.element !== element) return null;
    plan.set(element, { scope: "rendered-instance", instanceOverride });
  }
  return plan;
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
