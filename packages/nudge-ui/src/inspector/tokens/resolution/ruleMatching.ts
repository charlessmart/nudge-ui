import type { MatchedRule } from "../../../css/model/index.ts";
import { INTERACTION_STATES, type InteractionState } from "../../shell/styleState.ts";
import { collectRules as collectCssomRules, documentRevisions as getDocumentRevisions } from "./cssomCollector.ts";
import {
  computeSpecificity,
  hasSelectorPseudoClass,
  isElementSensitiveSelector,
  canMatchSelectorSubject,
  selectorPseudoClasses,
  splitSelectorAtTopLevel,
} from "./selectorSemantics.ts";

export interface ElementMatch {
  rule: MatchedRule;
  /** The selector actually used for matching (state-stripped for interaction states). */
  selectorText: string;
  branch: string;
  specificity: number;
}

/**
 * The selector set used by a resolution. Interaction states strip or drop
 * pseudo-class rules, `live` keeps the raw CSSOM rules (used by
 * `getResolvedProperties`), and `stable` drops transient rules (used by
 * `getResolvedPropertiesStable`).
 */
type CascadeTransform = InteractionState | "live" | "stable";

const TRANSIENT_PSEUDO_CLASSES = new Set([
  "hover",
  "active",
  "focus",
  "focus-visible",
  "focus-within",
  "visited",
  "target",
]);
const INTERACTION_PSEUDO_CLASSES = new Set<string>(INTERACTION_STATES);

function selectorForState(selector: string, state: InteractionState): string | null {
  const pseudoClasses = selectorPseudoClasses(selector)
    .filter(({ name }) => INTERACTION_PSEUDO_CLASSES.has(name));
  const states = new Set(pseudoClasses.map(({ name }) => name));
  if (state === "base") return states.size === 0 ? selector : null;
  if (!states.has(state)) return states.size === 0 ? selector : null;
  // CSSOM cannot ask the browser whether a hypothetical pseudo-class matches.
  // Removing interaction pseudo-classes gives the authored rule a stable
  // element match for inspection. The real rule remains untouched.
  let transformed = selector;
  for (let index = pseudoClasses.length - 1; index >= 0; index--) {
    const pseudoClass = pseudoClasses[index]!;
    transformed = transformed.slice(0, pseudoClass.start) + transformed.slice(pseudoClass.end);
  }
  return transformed;
}

function specificityForBranch(rule: Pick<MatchedRule, "selectorText" | "specificity">, branch: string): number {
  // Single-branch selectors reuse the specificity collected from CSSOM; the
  // matched branch is the whole selector. Multi-branch selectors need the
  // matched branch's own weight, so recompute per branch.
  return rule.selectorText.includes(",") ? computeSpecificity(branch) : rule.specificity;
}

const transformedRulesMemo = new WeakMap<MatchedRule[], Map<CascadeTransform, Array<{ rule: MatchedRule; selectorText: string }>>>();

function rulesForTransform(rules: MatchedRule[], transform: CascadeTransform): Array<{ rule: MatchedRule; selectorText: string }> {
  let byTransform = transformedRulesMemo.get(rules);
  if (!byTransform) {
    byTransform = new Map();
    transformedRulesMemo.set(rules, byTransform);
  }
  const cached = byTransform.get(transform);
  if (cached) return cached;
  let transformed: Array<{ rule: MatchedRule; selectorText: string }>;
  if (transform === "live") {
    transformed = rules.map((rule) => ({ rule, selectorText: rule.selectorText }));
  } else if (transform === "stable") {
    transformed = rules
      .filter((rule) => !hasSelectorPseudoClass(rule.selectorText, TRANSIENT_PSEUDO_CLASSES))
      .map((rule) => ({ rule, selectorText: rule.selectorText }));
  } else {
    transformed = rules.flatMap((rule) => {
      const selectorText = selectorForState(rule.selectorText, transform);
      return selectorText ? [{ rule, selectorText }] : [];
    });
  }
  byTransform.set(transform, transformed);
  return transformed;
}

interface SourceSiteMatchBuckets {
  cacheable: Array<{ rule: MatchedRule; selectorText: string }>;
  elementSensitive: Array<{ rule: MatchedRule; selectorText: string }>;
}

const sourceSiteMatchBucketsMemo = new WeakMap<MatchedRule[], Map<CascadeTransform, SourceSiteMatchBuckets>>();

function sourceSiteMatchBuckets(rules: MatchedRule[], transform: CascadeTransform): SourceSiteMatchBuckets {
  let byTransform = sourceSiteMatchBucketsMemo.get(rules);
  if (!byTransform) {
    byTransform = new Map();
    sourceSiteMatchBucketsMemo.set(rules, byTransform);
  }
  const cached = byTransform.get(transform);
  if (cached) return cached;
  const cacheable: Array<{ rule: MatchedRule; selectorText: string }> = [];
  const elementSensitive: Array<{ rule: MatchedRule; selectorText: string }> = [];
  for (const entry of rulesForTransform(rules, transform)) {
    (isElementSensitiveSelector(entry.selectorText) ? elementSensitive : cacheable).push(entry);
  }
  const buckets = { cacheable, elementSensitive };
  byTransform.set(transform, buckets);
  return buckets;
}

const SOURCE_SITE_CACHE_MAX = 4096;
interface SourceSiteMatchCacheEntry {
  elementRevision: number;
  stylesheetRevision: number;
  matched: ElementMatch[];
}

let sourceSiteMatchCaches = new WeakMap<Document, Map<string, SourceSiteMatchCacheEntry>>();
let sourceSiteMatchCacheEntries = 0;
const concreteElementMatchCaches = new WeakMap<HTMLElement, Map<CascadeTransform, SourceSiteMatchCacheEntry>>();
// The all-rules sweep shares the active sweep's revision cache for stable
// selectors. Element-sensitive selectors stay fresh because browser state can
// change without a mutation observed by the registry.
const allMatchesMemo = new WeakMap<HTMLElement, Map<CascadeTransform, SourceSiteMatchCacheEntry>>();

/** Test-only cache reset. */
export function resetSourceSiteMatchCache(): void {
  sourceSiteMatchCaches = new WeakMap();
  sourceSiteMatchCacheEntries = 0;
}

/** Test-only cache size. */
export function sourceSiteMatchCacheSize(): number {
  return sourceSiteMatchCacheEntries;
}

/**
 * Captures selector-relevant state without serializing the whole document.
 * Element and ancestor attributes cover the common source-site selectors while
 * child/sibling-sensitive selectors are handled conservatively below.
 */
function sourceSiteContextKey(el: HTMLElement): string {
  const lineage: string[] = [];
  let current: HTMLElement | null = el;
  while (current) {
    const attributes = Array.from(current.attributes)
      .filter((attribute) => attribute.name !== "data-renderer-id")
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((attribute) => `${attribute.name}=${attribute.value}`)
      .join("\u0002");
    lineage.push(`${current.tagName}\u0003${attributes}`);
    current = current.parentElement;
  }
  return lineage.join("\u0001");
}

/**
 * Source-site identity key for the matched-rule cache. The element's class is
 * part of the key because sibling instances of a source site can carry
 * different classes (for example rows in a large list), which changes which
 * rules match even though their `data-cid`/`data-src` are identical.
 */
function sourceSiteKey(el: HTMLElement, transform: CascadeTransform): string {
  const cid = el.getAttribute("data-cid") ?? "";
  const src = el.getAttribute("data-src") ?? "";
  const instance = el.getAttribute("data-projection-instance") ?? "";
  const className = typeof el.className === "string" ? el.className : "";
  return `${cid}\u0000${src}\u0000${instance}\u0000${className}\u0000${transform}`;
}

export function matchRuleForElement(el: HTMLElement, entry: { rule: MatchedRule; selectorText: string }): ElementMatch | null {
  const branch = matchingSelectorBranch(el, entry.selectorText);
  if (!branch) return null;
  return {
    rule: entry.rule,
    selectorText: entry.selectorText,
    branch,
    specificity: specificityForBranch({ ...entry.rule, selectorText: entry.selectorText }, branch),
  };
}

/**
 * Captures the current match outcome for selectors whose truth can change
 * without a document revision. This keeps the expensive resolved-row cache
 * usable while invalidating it when states such as `checked` actually change.
 */
function elementSensitiveMatchKey(
  el: HTMLElement,
  rules: MatchedRule[],
  transform: CascadeTransform,
  sensitiveMatchesByElement?: Map<HTMLElement, ElementMatch[]>,
): string {
  const entries = sourceSiteMatchBuckets(rules, transform).elementSensitive;
  if (entries.length === 0) return "";
  const matches: string[] = [];
  let current: HTMLElement | null = el;
  let depth = 0;
  while (current) {
    const elementMatches: ElementMatch[] = [];
    for (const entry of entries) {
      const match = matchRuleForElement(current, entry);
      if (!match) continue;
      elementMatches.push(match);
      matches.push(`${depth}:${entry.rule.sourceOrder ?? 0}:${match.branch}`);
    }
    sensitiveMatchesByElement?.set(current, elementMatches);
    current = current.parentElement;
    depth++;
  }
  return matches.join("\u0001");
}

function sensitiveMatchesForElement(
  el: HTMLElement,
  buckets: SourceSiteMatchBuckets,
  matchesByElement: Map<HTMLElement, ElementMatch[]>,
): ElementMatch[] {
  const cached = matchesByElement.get(el);
  if (cached) return cached;
  const matched = buckets.elementSensitive.flatMap((entry) => {
    const match = matchRuleForElement(el, entry);
    return match ? [match] : [];
  });
  matchesByElement.set(el, matched);
  return matched;
}

/**
 * Matches transformed rules against one element. Stable source-site identities
 * reuse revision-keyed matches; unstable identities and relationship-sensitive
 * selectors are matched on each call.
 */
function getCachedElementMatches(
  el: HTMLElement,
  rules: MatchedRule[],
  transform: CascadeTransform,
  sensitiveMatchesByElement: Map<HTMLElement, ElementMatch[]> = new Map(),
): ElementMatch[] {
  const buckets = sourceSiteMatchBuckets(rules, transform);
  const { cacheable, elementSensitive } = buckets;
  const collect = (entries: Array<{ rule: MatchedRule; selectorText: string }>): ElementMatch[] => {
    const matched: ElementMatch[] = [];
    for (const entry of entries) {
      if (entry.rule.active === false) continue;
      const match = matchRuleForElement(el, entry);
      if (match) matched.push(match);
    }
    return matched;
  };
  const cid = el.getAttribute("data-cid");
  const doc = el.ownerDocument ?? document;
  const revisions = getDocumentRevisions(doc);
  if (!cid || cacheable.length === 0) {
    let cachedMatches: ElementMatch[] = [];
    if (cacheable.length > 0) {
      let cache = concreteElementMatchCaches.get(el);
      if (!cache) {
        cache = new Map();
        concreteElementMatchCaches.set(el, cache);
      }
      const cached = cache.get(transform);
      if (cached
        && cached.elementRevision === revisions.element
        && cached.stylesheetRevision === revisions.stylesheet) {
        cachedMatches = cached.matched;
      } else {
        cachedMatches = collect(cacheable);
        cache.set(transform, {
          elementRevision: revisions.element,
          stylesheetRevision: revisions.stylesheet,
          matched: cachedMatches,
        });
      }
    }
    const sensitiveMatches = elementSensitive.length > 0
      ? sensitiveMatchesForElement(el, buckets, sensitiveMatchesByElement).filter((match) => match.rule.active !== false)
      : [];
    return sensitiveMatches.length === 0 ? cachedMatches : [...cachedMatches, ...sensitiveMatches];
  }
  const key = `${sourceSiteKey(el, transform)}\u0000${sourceSiteContextKey(el)}`;
  let cache = sourceSiteMatchCaches.get(doc);
  if (!cache) {
    cache = new Map();
    sourceSiteMatchCaches.set(doc, cache);
  }
  const cached = cache.get(key);
  let cachedMatches: ElementMatch[];
  if (cached
    && cached.elementRevision === revisions.element
    && cached.stylesheetRevision === revisions.stylesheet) {
    cachedMatches = cached.matched;
  } else {
    cachedMatches = collect(cacheable);
    if (sourceSiteMatchCacheEntries >= SOURCE_SITE_CACHE_MAX) {
      sourceSiteMatchCaches = new WeakMap();
      sourceSiteMatchCacheEntries = 0;
      cache = new Map();
      sourceSiteMatchCaches.set(doc, cache);
    }
    if (!cache.has(key)) sourceSiteMatchCacheEntries++;
    cache.set(key, {
      elementRevision: revisions.element,
      stylesheetRevision: revisions.stylesheet,
      matched: cachedMatches,
    });
  }
  // Browser state such as `checked` or `target` can change without a DOM or
  // stylesheet revision, so element-sensitive matches must stay fresh.
  const elementMatches = elementSensitive.length > 0
    ? sensitiveMatchesForElement(el, buckets, sensitiveMatchesByElement).filter((match) => match.rule.active !== false)
    : [];
  return elementMatches.length === 0 ? cachedMatches : [...cachedMatches, ...elementMatches];
}

/**
 * Matches selectors without applying conditional wrappers. The result retains
 * inactive media alternatives for attribution, while transient selectors and
 * the `live` transform retain their freshness requirements.
 */
function getAllElementMatches(
  el: HTMLElement,
  rules: MatchedRule[],
  transform: CascadeTransform,
  sensitiveMatchesByElement: Map<HTMLElement, ElementMatch[]> = new Map(),
): ElementMatch[] {
  const buckets = sourceSiteMatchBuckets(rules, transform);
  if (transform === "live") {
    const cacheableMatches = buckets.cacheable.flatMap((entry) => {
      const match = matchRuleForElement(el, entry);
      return match ? [match] : [];
    });
    return [...cacheableMatches, ...sensitiveMatchesForElement(el, buckets, sensitiveMatchesByElement)];
  }
  const { cacheable, elementSensitive } = buckets;
  const collect = (entries: Array<{ rule: MatchedRule; selectorText: string }>): ElementMatch[] => entries.flatMap((entry) => {
    const match = matchRuleForElement(el, entry);
    return match ? [match] : [];
  });
  const doc = el.ownerDocument ?? document;
  const revisions = getDocumentRevisions(doc);
  let cachedMatches: ElementMatch[] = [];
  if (cacheable.length > 0) {
    let byTransform = allMatchesMemo.get(el);
    if (!byTransform) {
      byTransform = new Map();
      allMatchesMemo.set(el, byTransform);
    }
    const cached = byTransform.get(transform);
    if (cached
      && cached.elementRevision === revisions.element
      && cached.stylesheetRevision === revisions.stylesheet) {
      cachedMatches = cached.matched;
    } else {
      cachedMatches = collect(cacheable);
      byTransform.set(transform, {
        elementRevision: revisions.element,
        stylesheetRevision: revisions.stylesheet,
        matched: cachedMatches,
      });
    }
  }
  const sensitiveMatches = elementSensitive.length > 0
    ? sensitiveMatchesForElement(el, buckets, sensitiveMatchesByElement)
    : [];
  return sensitiveMatches.length === 0 ? cachedMatches : [...cachedMatches, ...sensitiveMatches];
}

// Branch splits repeat across sweeps, so memoize them for the finite selector
// set in a stylesheet snapshot.
const SELECTOR_SPLIT_CACHE_MAX = 8192;
const selectorSplitMemo = new Map<string, string[]>();

// Branch matches are reusable for state-independent selectors. Transient
// selectors stay uncached because their state is not represented by document
// revisions.
const ELEMENT_BRANCH_CACHE_MAX = 16384;
const elementBranchMemo = new WeakMap<Element, Map<string, {
  elementRevision: number;
  stylesheetRevision: number;
  branch: string | null;
  }>>();

function isBranchMemoizable(selectorText: string): boolean {
  return !hasSelectorPseudoClass(selectorText, TRANSIENT_PSEUDO_CLASSES)
    && !isElementSensitiveSelector(selectorText);
}

function matchingSelectorBranch(el: Element, selectorText: string): string | null {
  const doc = el.ownerDocument ?? document;
  const revisions = getDocumentRevisions(doc);
  let bySelector = elementBranchMemo.get(el);
  const memoizable = isBranchMemoizable(selectorText);
  if (memoizable) {
    if (!bySelector) {
      bySelector = new Map();
      elementBranchMemo.set(el, bySelector);
    }
    const cached = bySelector.get(selectorText);
    if (cached
      && cached.elementRevision === revisions.element
      && cached.stylesheetRevision === revisions.stylesheet) {
      return cached.branch;
    }
  }
  let branches = selectorSplitMemo.get(selectorText);
  if (!branches) {
    branches = splitSelectorAtTopLevel(selectorText, ",");
    if (selectorSplitMemo.size >= SELECTOR_SPLIT_CACHE_MAX) selectorSplitMemo.clear();
    selectorSplitMemo.set(selectorText, branches);
  }
  let branch: string | null = null;
  for (const candidate of branches) {
    const trimmedCandidate = candidate.trim();
    if (!canMatchSelectorSubject(el, trimmedCandidate)) continue;
    try {
      if (el.matches(trimmedCandidate)) {
        branch = trimmedCandidate;
        break;
      }
    } catch { /* invalid/unsupported selector */ }
  }
  if (memoizable) {
    if (bySelector!.size >= ELEMENT_BRANCH_CACHE_MAX) bySelector!.clear();
    bySelector!.set(selectorText, {
      elementRevision: revisions.element,
      stylesheetRevision: revisions.stylesheet,
      branch,
    });
  }
  return branch;
}

/**
 * Shares dynamic matches across cache validation and ancestry within one sweep.
 * Element-relative conditions, such as container queries, remain the resolver's
 * responsibility; these results describe selector matches and stylesheet activity.
 */
export interface RuleMatcher {
  dynamicMatchKey(element: HTMLElement): string;
  matchesForElement(element: HTMLElement): { matched: ElementMatch[]; allMatched: ElementMatch[] };
}

/** Creates a matcher for one CSSOM snapshot. */
export function createRuleMatcher(rules: MatchedRule[], transform: CascadeTransform): RuleMatcher {
  const sensitiveMatches = new Map<HTMLElement, ElementMatch[]>();
  return {
    dynamicMatchKey: (element) => elementSensitiveMatchKey(element, rules, transform, sensitiveMatches),
    matchesForElement: (element) => ({
      matched: getCachedElementMatches(element, rules, transform, sensitiveMatches),
      allMatched: getAllElementMatches(element, rules, transform, sensitiveMatches),
    }),
  };
}

/**
 * Interaction states whose pseudo-class appears in the snapshot. Skipping
 * absent states avoids a full match sweep after each stylesheet revision.
 */
const statesWithPseudoInSnapshot = new WeakMap<MatchedRule[], Set<InteractionState>>();

function statesWithPseudoInSelectors(rules: MatchedRule[]): Set<InteractionState> {
  let present = statesWithPseudoInSnapshot.get(rules);
  if (!present) {
    present = new Set();
    for (const rule of rules) {
      for (const state of INTERACTION_STATES) {
        if (!present.has(state) && rule.selectorText.includes(`:${state}`)) {
          present.add(state);
        }
      }
    }
    statesWithPseudoInSnapshot.set(rules, present);
  }
  return present;
}

export function getAvailableInteractionStates(el: HTMLElement): InteractionState[] {
  const doc = el.ownerDocument ?? document;
  const { rules } = collectCssomRules(doc);
  const present = statesWithPseudoInSelectors(rules);
  const available: InteractionState[] = ["base"];
  for (const state of INTERACTION_STATES) {
    if (!present.has(state)) continue;
    const matched = getCachedElementMatches(el, rules, state);
    const relevant = matched.some((m) => m.rule.selectorText.includes(`:${state}`));
    if (relevant) available.push(state);
  }
  return available;
}
