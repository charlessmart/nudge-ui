import type { MatchedRule } from "../../../css/model/index.ts";
import { INTERACTION_STATES, type InteractionState } from "../../shell/styleState.ts";
import { collectRules as collectCssomRules, documentRevisions as getDocumentRevisions } from "./cssomCollector.ts";
import {
  computeSpecificity,
  hasSelectorPseudoClass,
  isElementSensitiveSelector,
  canMatchSelectorSubject,
  selectorPseudoClasses,
  selectorSubjectKey,
  splitSelectorAtTopLevel,
} from "./selectorSemantics.ts";

export interface ElementMatch {
  rule: MatchedRule;
  /** The selector actually used for matching (state-stripped for interaction states). */
  selectorText: string;
  branch: string;
  specificity: number;
}

/** Resolution vocabulary: interaction states strip matching pseudo-classes, `stable` drops transient rules, `live` keeps raw CSSOM rules. */
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

/** Per-branch transform, so a stateful branch such as `.b:active` cannot drop a plain sibling branch. */
function transformSelectorBranches(
  selector: string,
  transformBranch: (branch: string) => string | null,
): string | null {
  if (!selector.includes(",")) return transformBranch(selector);
  const kept = splitSelectorAtTopLevel(selector, ",")
    .map((branch) => transformBranch(branch.trim()))
    .filter((branch): branch is string => branch !== null && branch.length > 0);
  return kept.length > 0 ? kept.join(", ") : null;
}

function selectorForState(selector: string, state: InteractionState): string | null {
  return transformSelectorBranches(selector, (branch) => branchForState(branch, state));
}

function stableSelector(selector: string): string | null {
  return transformSelectorBranches(
    selector,
    (branch) => hasSelectorPseudoClass(branch, TRANSIENT_PSEUDO_CLASSES) ? null : branch,
  );
}

export function branchForState(selector: string, state: InteractionState): string | null {
  const pseudoClasses = selectorPseudoClasses(selector)
    .filter(({ name }) => INTERACTION_PSEUDO_CLASSES.has(name));
  const states = new Set(pseudoClasses.map(({ name }) => name));
  if (state === "base") return states.size === 0 ? selector : null;
  if (!states.has(state)) return states.size === 0 ? selector : null;
  // CSSOM cannot test a hypothetical pseudo-class, so strip it for a stable element match; the real rule is untouched.
  let transformed = selector;
  for (let index = pseudoClasses.length - 1; index >= 0; index--) {
    const pseudoClass = pseudoClasses[index]!;
    transformed = transformed.slice(0, pseudoClass.start) + transformed.slice(pseudoClass.end);
  }
  return transformed;
}

function specificityForBranch(rule: Pick<MatchedRule, "selectorText" | "specificity">, branch: string): number {
  // Multi-branch selectors need the matched branch's own weight; a single branch reuses the CSSOM specificity.
  return rule.selectorText.includes(",") ? computeSpecificity(branch) : rule.specificity;
}

const transformedRulesMemo = new WeakMap<MatchedRule[], Map<CascadeTransform, Array<{ rule: MatchedRule; selectorText: string }>>>();

// Lists change per revision but selectors rarely do, so transformed selectors are cached by text.
const TRANSFORMED_SELECTOR_CACHE_MAX = 32_768;
const transformedSelectorMemo = new Map<CascadeTransform, Map<string, string | null>>();

function transformSelector(selectorText: string, transform: Exclude<CascadeTransform, "live">): string | null {
  let byText = transformedSelectorMemo.get(transform);
  if (!byText) {
    byText = new Map();
    transformedSelectorMemo.set(transform, byText);
  }
  const cached = byText.get(selectorText);
  if (cached !== undefined) return cached;
  const transformed = transform === "stable" ? stableSelector(selectorText) : selectorForState(selectorText, transform);
  if (byText.size >= TRANSFORMED_SELECTOR_CACHE_MAX) byText.clear();
  byText.set(selectorText, transformed);
  return transformed;
}

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
  } else {
    transformed = rules.flatMap((rule) => {
      const selectorText = transformSelector(rule.selectorText, transform);
      return selectorText ? [{ rule, selectorText }] : [];
    });
  }
  byTransform.set(transform, transformed);
  return transformed;
}

type MatchEntry = { rule: MatchedRule; selectorText: string };

/** Entries keyed by what their subject requires (a class, an id or a tag), as browsers do, because testing thousands of rules dominates latency. */
interface SubjectIndex {
  byKey: Map<string, number[]>;
  /** Entries with a branch whose subject requires none of those. */
  unindexed: number[];
  unindexedEntries: MatchEntry[];
}

const subjectIndexMemo = new WeakMap<readonly MatchEntry[], SubjectIndex>();
const SUBJECT_KEYS_CACHE_MAX = 32_768;
const subjectKeysMemo = new Map<string, readonly string[] | null>();

/** One required key per branch, or null when some branch requires none. */
function subjectKeys(selectorText: string): readonly string[] | null {
  const cached = subjectKeysMemo.get(selectorText);
  if (cached !== undefined) return cached;
  const keys = new Set<string>();
  let indexed = true;
  for (const branch of splitSelectorAtTopLevel(selectorText, ",")) {
    const key = selectorSubjectKey(branch.trim());
    if (key === null) {
      indexed = false;
      break;
    }
    keys.add(key);
  }
  const result = indexed ? [...keys] : null;
  if (subjectKeysMemo.size >= SUBJECT_KEYS_CACHE_MAX) subjectKeysMemo.clear();
  subjectKeysMemo.set(selectorText, result);
  return result;
}

function subjectIndex(entries: readonly MatchEntry[]): SubjectIndex {
  const cached = subjectIndexMemo.get(entries);
  if (cached) return cached;
  const byKey = new Map<string, number[]>();
  const unindexed: number[] = [];
  entries.forEach((entry, index) => {
    const keys = subjectKeys(entry.selectorText);
    if (keys === null) {
      unindexed.push(index);
      return;
    }
    for (const key of keys) {
      const bucket = byKey.get(key);
      if (bucket) bucket.push(index);
      else byKey.set(key, [index]);
    }
  });
  const built = { byKey, unindexed, unindexedEntries: unindexed.map((index) => entries[index]!) };
  subjectIndexMemo.set(entries, built);
  return built;
}

/** Entries that can match `el`, in original order; only skips branches that need a class, id or tag the element lacks. */
function candidateEntries(entries: readonly MatchEntry[], el: Element): readonly MatchEntry[] {
  const index = subjectIndex(entries);
  const buckets: number[][] = [];
  const collect = (key: string): void => {
    const bucket = index.byKey.get(key);
    if (bucket) buckets.push(bucket);
  };
  for (const className of el.classList) collect(`.${className}`);
  if (el.id) collect(`#${el.id}`);
  collect(`<${el.localName.toLowerCase()}`);
  if (buckets.length === 0) return index.unindexedEntries;
  const picked = [...index.unindexed];
  for (const bucket of buckets) for (const entryIndex of bucket) picked.push(entryIndex);
  picked.sort((left, right) => left - right);
  const candidates: MatchEntry[] = [];
  let previous = -1;
  for (const entryIndex of picked) {
    if (entryIndex === previous) continue;
    previous = entryIndex;
    candidates.push(entries[entryIndex]!);
  }
  return candidates;
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
const allMatchesMemo = new WeakMap<HTMLElement, Map<CascadeTransform, SourceSiteMatchCacheEntry>>();

export function resetSourceSiteMatchCache(): void {
  sourceSiteMatchCaches = new WeakMap();
  sourceSiteMatchCacheEntries = 0;
}

export function sourceSiteMatchCacheSize(): number {
  return sourceSiteMatchCacheEntries;
}

/** Selector-relevant element and ancestor attributes, without serializing the whole document. */
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

/** `data-cid`/`data-src` are identical across sibling instances, so the class is part of the key. */
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
    specificity: specificityForBranch(entry.rule, branch),
  };
}

/** Match key for selectors whose truth can change without a document revision. */
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
    for (const entry of candidateEntries(entries, current)) {
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
  const matched = candidateEntries(buckets.elementSensitive, el).flatMap((entry) => {
    const match = matchRuleForElement(el, entry);
    return match ? [match] : [];
  });
  matchesByElement.set(el, matched);
  return matched;
}

/** Stable source-site identities reuse revision-keyed matches; unstable identities and relationship-sensitive selectors match per call. */
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
    for (const entry of candidateEntries(entries, el)) {
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
  // Browser state (:checked, :target) can change without a revision, so element-sensitive matches stay fresh.
  const elementMatches = elementSensitive.length > 0
    ? sensitiveMatchesForElement(el, buckets, sensitiveMatchesByElement).filter((match) => match.rule.active !== false)
    : [];
  return elementMatches.length === 0 ? cachedMatches : [...cachedMatches, ...elementMatches];
}

/** Keeps inactive media alternatives for attribution; transient and `live` matches keep their freshness requirements. */
function getAllElementMatches(
  el: HTMLElement,
  rules: MatchedRule[],
  transform: CascadeTransform,
  sensitiveMatchesByElement: Map<HTMLElement, ElementMatch[]> = new Map(),
): ElementMatch[] {
  const buckets = sourceSiteMatchBuckets(rules, transform);
  if (transform === "live") {
    const cacheableMatches = candidateEntries(buckets.cacheable, el).flatMap((entry) => {
      const match = matchRuleForElement(el, entry);
      return match ? [match] : [];
    });
    return [...cacheableMatches, ...sensitiveMatchesForElement(el, buckets, sensitiveMatchesByElement)];
  }
  const { cacheable, elementSensitive } = buckets;
  const collect = (entries: Array<{ rule: MatchedRule; selectorText: string }>): ElementMatch[] => candidateEntries(entries, el).flatMap((entry) => {
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

// Branch splits repeat across sweeps over a finite selector set, so memoize them.
const SELECTOR_SPLIT_CACHE_MAX = 32_768;
const selectorSplitMemo = new Map<string, string[]>();

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

/** Element-relative conditions (container queries) stay the resolver's job; these describe selector matches and stylesheet activity. */
export interface RuleMatcher {
  dynamicMatchKey(element: HTMLElement): string;
  matchesForElement(element: HTMLElement): { matched: ElementMatch[]; allMatched: ElementMatch[] };
}

type SensitiveMatchScope = WeakMap<MatchedRule[], Map<CascadeTransform, Map<HTMLElement, ElementMatch[]>>>;

let sensitiveMatchScope: SensitiveMatchScope | null = null;

/**
 * Element-sensitive selectors (`:has()`, sibling combinators, `:checked`) are re-evaluated per matcher so they stay fresh. One synchronous refresh builds several matchers over the same lineage (the container query prefetch, then the authored and stable cascades) and nothing can change between them, so within `run` they share their results.
 */
export function withSharedSensitiveMatches<T>(run: () => T): T {
  if (sensitiveMatchScope) return run();
  sensitiveMatchScope = new WeakMap();
  try {
    return run();
  } finally {
    sensitiveMatchScope = null;
  }
}

function sensitiveMatchMemo(rules: MatchedRule[], transform: CascadeTransform): Map<HTMLElement, ElementMatch[]> {
  if (!sensitiveMatchScope) return new Map();
  let byTransform = sensitiveMatchScope.get(rules);
  if (!byTransform) {
    byTransform = new Map();
    sensitiveMatchScope.set(rules, byTransform);
  }
  let memo = byTransform.get(transform);
  if (!memo) {
    memo = new Map();
    byTransform.set(transform, memo);
  }
  return memo;
}

export function createRuleMatcher(rules: MatchedRule[], transform: CascadeTransform): RuleMatcher {
  const sensitiveMatches = sensitiveMatchMemo(rules, transform);
  return {
    dynamicMatchKey: (element) => elementSensitiveMatchKey(element, rules, transform, sensitiveMatches),
    matchesForElement: (element) => ({
      matched: getCachedElementMatches(element, rules, transform, sensitiveMatches),
      allMatched: getAllElementMatches(element, rules, transform, sensitiveMatches),
    }),
  };
}

/** States whose pseudo-class appears in the snapshot, so absent states skip a full match sweep. */
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

/** Warms transforms, buckets, and class indexes so an idle frame pays their parsing cost. */
export function prewarmRuleMatching(rules: MatchedRule[]): void {
  const transforms: CascadeTransform[] = ["base", "stable", "live", ...statesWithPseudoInSelectors(rules)];
  for (const transform of new Set(transforms)) {
    const { cacheable, elementSensitive } = sourceSiteMatchBuckets(rules, transform);
    subjectIndex(cacheable);
    subjectIndex(elementSensitive);
  }
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
