import {
  getRenderedInstanceOverride,
  createRenderedInstanceOverride,
  buildRenderedInstanceOverrideForTarget,
  captureRenderedInstance,
  clearRenderedInstanceOverride,
  resolveRenderedInstance,
  type RenderedInstanceOverride,
  type RenderedInstanceRef,
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

type BatchScopeDecision =
  | BatchScopeFields
  | { scope: "new-rendered-instance"; target: RenderedInstanceRef };

/**
 * Plans the scope for every target in a batch edit without mutating the DOM or
 * transient instance state. A partial repeated-source group is editable only
 * when each selected output has evidence that resolves uniquely.
 */
function analyzeBatchEditScopes(
  selectedElements: readonly HTMLElement[],
): ReadonlyMap<HTMLElement, BatchScopeDecision> | null {
  const plan = new Map<HTMLElement, BatchScopeDecision>();
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

    const target = captureRenderedInstance(element);
    if (!target) return null;
    const resolution = resolveRenderedInstance(element.ownerDocument, target);
    if (resolution.status !== "resolved" || resolution.element !== element) return null;
    plan.set(element, { scope: "new-rendered-instance", target });
  }
  return plan;
}

/** Returns whether every element can be addressed safely by one batch edit. */
export function canPlanBatchEditScopes(selectedElements: readonly HTMLElement[]): boolean {
  return analyzeBatchEditScopes(selectedElements) !== null;
}

/** Resolves safe scopes immediately before a write is committed. */
export function planBatchEditScopes(
  selectedElements: readonly HTMLElement[],
): ReadonlyMap<HTMLElement, BatchScopeFields> | null {
  const decisions = analyzeBatchEditScopes(selectedElements);
  if (!decisions) return null;
  const plan = new Map<HTMLElement, BatchScopeFields>();
  for (const [element, decision] of decisions) {
    plan.set(element, decision.scope === "new-rendered-instance"
      ? {
          scope: "rendered-instance",
          instanceOverride: buildRenderedInstanceOverrideForTarget(decision.target),
        }
      : decision);
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
