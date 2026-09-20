import { readTailwindV4AlphaUtility, tailwindV4AlphaExpression } from "../../css/dialects/index.ts";
import type { InteractionState } from "../shell/styleState.ts";
import { getElementComputedStyle } from "../runtime/domRealm.ts";
import {
  collectRules as collectCssomRules,
  documentRevisions as getDocumentRevisions,
  registerResolutionLineage,
} from "./resolution/cssomCollector.ts";
import { createRuleMatcher, matchRuleForElement, type ElementMatch, type RuleMatcher } from "./resolution/ruleMatching.ts";
import { compareAuthorCascade } from "./resolution/cascade.ts";
import type {
  AtRuleCandidate,
  AtRuleContext,
  BorderStructure,
  ColorOpacity,
  ColorValueFacts,
  EditCapability,
  MatchedRule,
  OpacityValue,
  ResolvedProperty,
  StyleDeclaration,
  TokenReference,
  TokenTable,
  ValueModifier,
} from "../../css/model/index.ts";
import {
  interpretValue,
  normalizeOpacityPercent,
  type Directionality,
  type InterpretedValueField,
} from "../../css/value-semantics/index.ts";
import { createInspectorValueContext, inspectorTokenOrigin } from "./valueSemanticsAdapter.ts";

export { getAvailableInteractionStates, resetSourceSiteMatchCache, sourceSiteMatchCacheSize } from "./resolution/ruleMatching.ts";
export { buildTokenTable, getTokenTable, getAvailableTokenEntriesForElement, getAvailableTokenCatalog } from "./tokenAvailability.ts";
export { invalidateStyleResolutionCache } from "./resolution/cssomCollector.ts";

/**
 * Builds (or reuses) the document's CSSOM rule snapshot ahead of a resolution
 * sweep. Idempotent: the walk runs once per stylesheet revision and is a cache
 * hit afterwards, so a scheduler can warm it in its own frame to keep the
 * subsequent resolution sweep's blocking time small.
 */
export function prewarmCssomRuleSnapshot(doc: Document): void {
  collectCssomRules(doc);
}

const MAX_PROPERTIES = 100;
const EMPTY_LOCAL_ALIASES: ReadonlyMap<string, string> = new Map();

/**
 * Returns true when a `calc()` expression is safe to treat as a simple
 * numeric value. We exclude percentages, viewport units, and font-relative
 * units because those depend on context the browser cannot freeze into a
 * single pixel value safely.
 */
function canBecomeNumeric(value: string): boolean {
  const v = value.trim();
  if (/\b(?:min|max|clamp|env|anchor-size)\s*\(/i.test(v)) return false;
  const m = /^calc\s*\(/i.exec(v);
  if (!m) return false;
  const inner = v.slice(m[0].length, -1).trim();
  const withoutVars = inner.replace(/var\([^)]+\)/g, "");
  return !/\b\d+(?:\.\d+)?(?:%|vw|vh|vmin|vmax|dvw|dvh|sv[lw]h|lv[lw]h|[ce]m|ex|ch)\b/i.test(withoutVars);
}

function normalizeInElementContext(el: HTMLElement, property: string, value: string): string {
  const doc = el.ownerDocument;
  const probe = doc.createElement(el.tagName.toLowerCase());
  probe.setAttribute("data-nudge-ui", "attribution-probe");
  probe.style.setProperty(property, value, "important");
  probe.style.setProperty("position", "fixed", "important");
  probe.style.setProperty("visibility", "hidden", "important");
  el.parentElement?.insertBefore(probe, el.nextSibling);
  if (!probe.isConnected) doc.body.appendChild(probe);
  const normalized = getElementComputedStyle(probe).getPropertyValue(property).trim();
  probe.remove();
  return normalized;
}

function candidateMatchesPainted(el: HTMLElement, row: ResolvedProperty, painted: string): boolean {
  if (!row.tokenName || !/^var\(\s*--[\w-]+\s*\)$/.test(row.declaredValue)) return false;
  return normalizeInElementContext(el, row.property, row.declaredValue) === painted.trim();
}

/**
 * Resolves one authored value through the value-semantics Module using the
 * inspector's integration context. Value semantics remains the sole
 * interpretation authority.
 */
function resolveTokenValue(
  value: string,
  tokenTable: TokenTable,
  localAliases: ReadonlyMap<string, string> = EMPTY_LOCAL_ALIASES,
): InterpretedValueField {
  return interpretValue("--nudge-ui-token", value, createInspectorValueContext(tokenTable, localAliases))[0]!;
}

function directionalityFromComputed(el: HTMLElement, computed: CSSStyleDeclaration): Directionality {
  return {
    direction: computed?.direction || el?.dir || "ltr",
    writingMode: computed?.getPropertyValue("writing-mode").trim() || "horizontal-tb",
  };
}

function elementDirectionality(el: HTMLElement): Directionality {
  return directionalityFromComputed(el, getElementComputedStyle(el));
}

function isLogicalBoxProperty(property: string): boolean {
  return /^(?:margin|padding|inset)-(?:inline|block)(?:-(?:start|end))?$/i.test(property);
}

interface ResolvedDeclaration {
  property: string;
  declaredValue: string;
  sourceProperty?: string;
  tokenName: string | null;
  resolvedValue: string;
  important?: boolean;
  tokens: TokenReference[];
  opacity?: ColorOpacity;
  propertyOpacity?: OpacityValue;
  color?: ColorValueFacts;
  modifiers: ValueModifier[];
  capability: EditCapability;
  resolvedTokenValue: string;
  diagnostic?: string;
  structure?: BorderStructure;
}

/**
 * Coordinates cascade facts with the value-semantics Module. All property-family
 * decomposition (logical sides, border, font, radius corners, physical spacing)
 * lives in `interpretValue`; this function only supplies the token
 * context and directionality facts, then projects the Module's fields onto the
 * `ResolvedDeclaration` shape.
 */
function resolveDeclaration(
  declaration: StyleDeclaration,
  tokenTable: TokenTable,
  localAliases: ReadonlyMap<string, string> = EMPTY_LOCAL_ALIASES,
  directionality?: Directionality,
): ResolvedDeclaration[] {
  const fields = interpretValue(
    declaration.property,
    declaration.value,
    createInspectorValueContext(tokenTable, localAliases, directionality),
  );
  return fields.map((field) => ({
    property: field.property,
    declaredValue: field.declaredValue,
    sourceProperty: field.sourceProperty,
    tokenName: field.tokenName,
    resolvedValue: field.resolvedValue,
    important: declaration.important,
    tokens: field.tokens,
    opacity: field.opacity,
    propertyOpacity: field.propertyOpacity,
    color: field.color,
    modifiers: field.modifiers,
    capability: field.capability,
    resolvedTokenValue: field.resolvedValue,
    ...(field.structure ? { structure: field.structure } : {}),
    ...(field.diagnostic ? { diagnostic: field.diagnostic } : {}),
  }));
}

function hydratePropertyOpacity(row: ResolvedProperty, computedValue: string): void {
  if (row.property.toLowerCase() !== "opacity") return;
  const value = normalizeOpacityPercent(computedValue);
  if (value === null) return;
  const existing = row.propertyOpacity;
  const token = existing?.token
    ?? (row.tokenName ? row.tokens?.find((reference) => reference.name === row.tokenName) : undefined);
  row.propertyOpacity = {
    value,
    authoredValue: existing?.authoredValue ?? row.authored ?? row.declaredValue,
    tokenName: existing?.tokenName ?? row.tokenName,
    ...(token ? { token } : {}),
    editable: existing?.editable ?? false,
  };
}

function hydratePropertyOpacityRows(rows: ResolvedProperty[], computed: CSSStyleDeclaration): void {
  for (const row of rows) hydratePropertyOpacity(row, computed.getPropertyValue(row.property));
}

function capabilityFor(property: string, value: string, tokenTable: TokenTable): EditCapability {
  return interpretValue(property, value, createInspectorValueContext(tokenTable))[0]!.capability;
}

interface LocalAliasCandidate {
  value: string;
  important?: boolean;
  inline?: boolean;
  layer?: string;
  layerOrder?: number;
  specificity: number;
  sourceOrder: number;
}

let containerProbeSequence = 0;

/**
 * Container conditions are element-relative. CSSOM exposes their text but has
 * no `matches` API, so ask the browser by applying an inert custom property to
 * the selected element inside an equivalent temporary @container wrapper.
 */
function matchesContainerQuery(el: HTMLElement, params: string): boolean {
  const doc = el.ownerDocument;
  if (!doc.head || !params) return false;

  const id = ++containerProbeSequence;
  const marker = `data-container-probe-${id}`;
  const property = `--container-probe-${id}`;
  const style = doc.createElement("style");
  style.setAttribute("data-nudge-ui", "container-probe");
  style.textContent = `@container ${params} { [${marker}] { ${property}: 1; } }`;

  el.setAttribute(marker, "");
  doc.head.appendChild(style);
  try {
    return getElementComputedStyle(el).getPropertyValue(property).trim() === "1";
  } catch {
    return false;
  } finally {
    style.remove();
    el.removeAttribute(marker);
  }
}

function atRulesApplyToElement(el: HTMLElement, atRules: readonly AtRuleContext[] | undefined): boolean {
  const view = el.ownerDocument.defaultView;
  return (atRules ?? []).every((atRule) => {
    if (atRule.kind === "container") return matchesContainerQuery(el, atRule.params);
    if (atRule.kind === "supports") return view?.CSS?.supports(atRule.params) ?? false;
    return true;
  });
}

function collectLocalAliases(
  el: HTMLElement,
  rules: MatchedRule[],
  ruleApplies: (rule: MatchedRule) => boolean,
): ReadonlyMap<string, string> {
  // Custom properties inherit independently of the property being resolved.
  // Resolve the winning declaration separately for each element in the
  // ancestor chain, then let the nearest declaration override inherited ones.
  // This covers local aliases such as --color-error and inherited page tokens
  // such as --color-ink without widening the build-time global catalog.
  const lineage: HTMLElement[] = [];
  let current: HTMLElement | null = el;
  while (current) {
    lineage.push(current);
    current = current.parentElement;
  }

  const aliases = new Map<string, string>();
  for (const element of lineage.reverse()) {
    const candidates = new Map<string, LocalAliasCandidate>();
    rules.forEach((rule, index) => {
      if (rule.active === false) return;
      if (!ruleApplies(rule)) return;
      const match = matchRuleForElement(element, { rule, selectorText: rule.selectorText });
      if (!match) return;
      const sourceOrder = rule.sourceOrder ?? index;
      const { specificity } = match;
      for (const declaration of rule.declarations) {
        if (!declaration.property.startsWith("--")) continue;
        const candidate: LocalAliasCandidate = {
          value: declaration.value.trim(),
          important: declaration.important,
          layer: rule.layer,
          layerOrder: rule.layerOrder,
          specificity,
          sourceOrder,
        };
        const previous = candidates.get(declaration.property);
        if (!previous || compareAuthorCascade(candidate, previous) >= 0) {
          candidates.set(declaration.property, candidate);
        }
      }
    });

    // Inline custom properties are also inherited by descendants. They are
    // explicit cascade winners for their element, so include them at inline
    // specificity without changing the managed-style rule contract.
    for (const property of Array.from(element.style)) {
      if (!property.startsWith("--")) continue;
      const candidate: LocalAliasCandidate = {
        value: element.style.getPropertyValue(property).trim(),
        important: element.style.getPropertyPriority(property) === "important",
        inline: true,
        specificity: 100000000,
        sourceOrder: Number.MAX_SAFE_INTEGER,
      };
      const previous = candidates.get(property);
      if (!previous || compareAuthorCascade(candidate, previous) >= 0) {
        candidates.set(property, candidate);
      }
    }

    for (const [name, candidate] of candidates) aliases.set(name, candidate.value);
  }

  return aliases;
}

interface ElementResolution {
  element: HTMLElement;
  matched: ElementMatch[];
  allMatched: ElementMatch[];
  aliases: ReadonlyMap<string, string>;
}

interface LineageResolution {
  lineage: HTMLElement[];
  byElement: Map<HTMLElement, ElementResolution>;
}

function makeRuleApplies(el: HTMLElement): (rule: MatchedRule) => boolean {
  const matchingContexts = new Map<string, boolean>();
  return (rule: MatchedRule): boolean => {
    const atRules = rule.atRules;
    if (!atRules || atRules.length === 0) return true;
    const key = JSON.stringify(atRules);
    const cached = matchingContexts.get(key);
    if (cached !== undefined) return cached;
    const result = atRulesApplyToElement(el, atRules);
    matchingContexts.set(key, result);
    return result;
  };
}

/**
 * One matching pass over the rules for the element and its ancestors, with the
 * selector-match results shared between the element's own resolution and the
 * inherited phase. Local aliases are collected per element so no ancestor
 * re-walks the lineage × rules.
 */
function resolveLineage(
  el: HTMLElement,
  matcher: RuleMatcher,
): LineageResolution {
  const lineage: HTMLElement[] = [];
  let current: HTMLElement | null = el;
  while (current) {
    lineage.push(current);
    current = current.parentElement;
  }
  lineage.reverse();

  const selectorMatches = new Map<HTMLElement, ElementMatch[]>();
  const allSelectorMatches = new Map<HTMLElement, ElementMatch[]>();
  for (const element of lineage) {
    const { matched, allMatched } = matcher.matchesForElement(element);
    selectorMatches.set(element, matched);
    allSelectorMatches.set(element, allMatched);
  }

  const byElement = new Map<HTMLElement, ElementResolution>();
  for (let index = 0; index < lineage.length; index++) {
    const element = lineage[index]!;
    const ruleApplies = makeRuleApplies(element);
    const aliases = new Map<string, string>();
    for (const lineageElement of lineage.slice(0, index + 1)) {
      const candidates = new Map<string, LocalAliasCandidate>();
      for (const match of selectorMatches.get(lineageElement) ?? []) {
        if (!ruleApplies(match.rule)) continue;
        const sourceOrder = match.rule.sourceOrder ?? 0;
        for (const declaration of match.rule.declarations) {
          if (!declaration.property.startsWith("--")) continue;
          const candidate: LocalAliasCandidate = {
            value: declaration.value.trim(),
            important: declaration.important,
            layer: match.rule.layer,
            layerOrder: match.rule.layerOrder,
            specificity: match.specificity,
            sourceOrder,
          };
          const previous = candidates.get(declaration.property);
          if (!previous || compareAuthorCascade(candidate, previous) >= 0) {
            candidates.set(declaration.property, candidate);
          }
        }
      }
      for (const property of Array.from(lineageElement.style)) {
        if (!property.startsWith("--")) continue;
        const candidate: LocalAliasCandidate = {
          value: lineageElement.style.getPropertyValue(property).trim(),
          important: lineageElement.style.getPropertyPriority(property) === "important",
          inline: true,
          specificity: 100000000,
          sourceOrder: Number.MAX_SAFE_INTEGER,
        };
        const previous = candidates.get(property);
        if (!previous || compareAuthorCascade(candidate, previous) >= 0) {
          candidates.set(property, candidate);
        }
      }
      for (const [name, candidate] of candidates) aliases.set(name, candidate.value);
    }
    const matched: ElementMatch[] = [];
    for (const match of selectorMatches.get(element) ?? []) {
      if (!ruleApplies(match.rule)) continue;
      matched.push(match);
    }
    byElement.set(element, {
      element,
      matched,
      allMatched: allSelectorMatches.get(element) ?? matched,
      aliases,
    });
  }
  return { lineage, byElement };
}

function rowsFromMatches(
  el: HTMLElement,
  matched: ElementMatch[],
  aliases: ReadonlyMap<string, string>,
  tokenTable: TokenTable,
  allMatched: ElementMatch[] = matched,
): ResolvedProperty[] {
  const map = new Map<string, ResolvedProperty>();
  const mediaCandidatesByProperty = new Map<string, Map<string, AtRuleContext>>();

  // Sort by source order ascending so rules are processed lowest-first.
  // Map.set() naturally overwrites: higher specificity rules processed later win,
  // and equal-specificity rules get "last in stylesheet order wins" (stable sort).
  const sorted = [...matched].sort((a, b) => (a.rule.sourceOrder ?? 0) - (b.rule.sourceOrder ?? 0));
  const needsDirectionality = sorted.some(({ rule }) =>
    rule.declarations.some(({ property }) => isLogicalBoxProperty(property)));
  const directionality = needsDirectionality ? elementDirectionality(el) : undefined;

  for (const match of allMatched) {
    const mediaAtRules = match.rule.atRules?.filter((atRule) => atRule.kind === "media") ?? [];
    if (mediaAtRules.length === 0) continue;
    for (const declaration of match.rule.declarations) {
      for (const resolved of resolveDeclaration(declaration, tokenTable, aliases, directionality)) {
        let candidates = mediaCandidatesByProperty.get(resolved.property);
        if (!candidates) {
          candidates = new Map();
          mediaCandidatesByProperty.set(resolved.property, candidates);
        }
        for (const atRule of mediaAtRules) {
          candidates.set(`${atRule.kind}\u0000${atRule.params}`, atRule);
        }
      }
    }
  }

  for (const m of sorted) {
    const { rule, branch, specificity } = m;
    for (const decl of rule.declarations) {
      for (const resolved of resolveDeclaration(decl, tokenTable, aliases, directionality)) {
        const candidate: ResolvedProperty = {
          property: resolved.property,
          tokenName: resolved.tokenName,
          declaredValue: resolved.declaredValue,
          sourceProperty: resolved.sourceProperty,
          resolvedValue: resolved.resolvedValue,
          authored: resolved.declaredValue,
          computed: "",
          tokens: resolved.tokens,
          opacity: resolved.opacity,
          propertyOpacity: resolved.propertyOpacity,
          color: resolved.color,
          modifiers: resolved.modifiers,
          capability: resolved.capability,
          resolvedTokenValue: resolved.resolvedTokenValue,
          diagnostic: resolved.diagnostic,
          structure: resolved.structure,
          atRules: rule.atRules,
          confidence: resolved.tokenName ? "probable" : "unknown",
          evidence: {
            selector: branch,
            sourceOrder: rule.sourceOrder,
            specificity,
            important: Boolean(resolved.important),
            layer: rule.layer,
            layerOrder: rule.layerOrder,
            reason: resolved.tokenName ? "authored declaration references a catalog token" : "no catalog token reference",
          },
        };
        const previous = map.get(resolved.property);
        if (!previous || compareCandidate(candidate, previous) >= 0) map.set(resolved.property, candidate);
      }
    }
  }
  const rows = Array.from(map.values()).slice(0, MAX_PROPERTIES);
  for (const row of rows) {
    const candidates = mediaCandidatesByProperty.get(row.property);
    if (!candidates || candidates.size === 0) continue;
    const winningMedia = (row.atRules ?? []).filter((atRule) => atRule.kind === "media");
    const winningKeys = new Set(winningMedia.map((atRule) => `${atRule.kind}\u0000${atRule.params}`));
    const allCandidates: AtRuleCandidate[] = [];
    let insertedWinningStack = false;
    for (const atRule of candidates.values()) {
      const key = `${atRule.kind}\u0000${atRule.params}`;
      if (winningKeys.has(key)) {
        if (!insertedWinningStack) {
          allCandidates.push(...winningMedia.map((winningAtRule) => ({ ...winningAtRule, active: true })));
          insertedWinningStack = true;
        }
      } else {
        allCandidates.push({ ...atRule, active: false });
      }
    }
    if (!insertedWinningStack) {
      allCandidates.push(...winningMedia.map((winningAtRule) => ({ ...winningAtRule, active: true })));
    }
    row.atRuleCandidates = allCandidates;
  }
  inferTailwindV4ColorOpacity(el, tokenTable, rows);
  for (const row of rows) {
    if (row.capability !== "raw" || row.diagnostic) continue;
    const value = row.authored ?? row.declaredValue ?? "";
    if (!canBecomeNumeric(value)) continue;
    const numeric = row.resolvedValue ?? row.computed ?? "";
    if (!numeric) continue;
    row.capability = capabilityFor(row.property, numeric, tokenTable);
  }
  return rows;
}

/**
 * Package-private cascade fixture seam. This exercises selector, layer,
 * importance, and interaction-state coordination while still crossing the
 * public value-semantics Interface through `resolveDeclaration`.
 * It is intentionally absent from the package exports.
 */
export function resolveRuleFixture(
  el: HTMLElement,
  rules: MatchedRule[],
  tokenTable: TokenTable,
): ResolvedProperty[] {
  const ruleApplies = makeRuleApplies(el);
  const matched: ElementMatch[] = [];
  const allMatched: ElementMatch[] = [];
  for (const rule of rules) {
    const match = matchRuleForElement(el, { rule, selectorText: rule.selectorText });
    if (!match) continue;
    allMatched.push(match);
    if (rule.active === false) continue;
    if (!ruleApplies(rule)) continue;
    matched.push(match);
  }
  const localAliases = collectLocalAliases(el, rules, ruleApplies);
  return rowsFromMatches(el, matched, localAliases, tokenTable, allMatched);
}

function compareCandidate(a: ResolvedProperty, b: ResolvedProperty): number {
  return compareAuthorCascade(
    {
      important: a.evidence.important,
      inline: a.evidence.selector === "[style]",
      layer: a.evidence.layer,
      layerOrder: a.evidence.layerOrder,
      specificity: a.evidence.specificity ?? 0,
      sourceOrder: a.evidence.sourceOrder ?? 0,
    },
    {
      important: b.evidence.important,
      inline: b.evidence.selector === "[style]",
      layer: b.evidence.layer,
      layerOrder: b.evidence.layerOrder,
      specificity: b.evidence.specificity ?? 0,
      sourceOrder: b.evidence.sourceOrder ?? 0,
    },
  );
}

function inferTailwindV4ColorOpacity(
  el: HTMLElement,
  tokenTable: TokenTable,
  rows: ResolvedProperty[],
): void {
  const row = rows.find((candidate) => candidate.property === "background-color" || candidate.property === "background");
  if (!row || row.tokenName) return;

  for (const className of Array.from(el.classList)) {
    const utility = readTailwindV4AlphaUtility(className);
    if (!utility) continue;
    const { baseName, alpha } = utility;
    const entry = tokenTable[baseName];
    if (!entry || entry.adapter !== "tailwind-v4") continue;
    const authored = tailwindV4AlphaExpression(baseName, alpha);
    row.tokenName = baseName;
    row.declaredValue = authored;
    row.authored = authored;
    row.tokens = [{ name: baseName, origin: inspectorTokenOrigin(entry) }];
    const colorInterpretation = resolveTokenValue(authored, tokenTable, EMPTY_LOCAL_ALIASES);
    row.opacity = colorInterpretation.opacity;
    row.color = colorInterpretation.color;
    row.modifiers = [{ kind: "alpha", value: alpha }];
    row.capability = "color";
    row.resolvedTokenValue = entry.value;
    row.evidence.reason = "Tailwind v4 opacity utility mapped to its base catalog token";
    row.confidence = "probable";
    return;
  }
}

interface ResolvedPropertiesSnapshot {
  elementRevision: number;
  stylesheetRevision: number;
  tokenTable: TokenTable;
  dynamicMatchKey: string;
  rows: ResolvedProperty[];
}

const stateResolutionSnapshots = new WeakMap<HTMLElement, Map<InteractionState, ResolvedPropertiesSnapshot>>();

const INHERITED_PROPERTIES = new Set([
  "color", "font", "font-family", "font-size", "font-style", "font-variant", "font-weight",
  "letter-spacing", "line-height", "text-align", "text-indent", "text-transform", "visibility",
  "white-space", "word-spacing", "cursor",
]);

function resolveInheritedProperties(
  el: HTMLElement,
  tokenTable: TokenTable,
  lineage: LineageResolution,
  result: ResolvedProperty[],
  inaccessible: boolean,
): ResolvedProperty[] {
  const computed = getElementComputedStyle(el);
  const seenProperties = new Set(result.map((p) => p.property));
  let ancestor: HTMLElement | null = el.parentElement;
  while (ancestor) {
    const entry = lineage.byElement.get(ancestor);
    if (entry) {
      const ancestorComputed = getElementComputedStyle(ancestor);
      for (const candidate of rowsFromMatches(ancestor, entry.matched, entry.aliases, tokenTable, entry.allMatched)) {
        if (seenProperties.has(candidate.property)) continue;
        if (!INHERITED_PROPERTIES.has(candidate.property) && !candidate.property.startsWith("--")) continue;
        const ancestorVal = ancestorComputed.getPropertyValue(candidate.property).trim();
        const elVal = computed.getPropertyValue(candidate.property).trim();
        if (ancestorVal && ancestorVal === elVal) {
          hydratePropertyOpacity(candidate, ancestorVal);
          result.push({
            ...candidate,
            resolvedValue: elVal,
            confidence: candidate.tokenName && candidateMatchesPainted(ancestor, candidate, ancestorVal) && !inaccessible && !candidate.evidence.layer ? "exact" : candidate.tokenName ? "probable" : "unknown",
            evidence: { ...candidate.evidence, inheritedFrom: ancestor.tagName.toLowerCase(), inaccessibleStylesheet: inaccessible || undefined, reason: "inherited property traced through the ancestor cascade" },
          });
          seenProperties.add(candidate.property);
        }
      }
    }
    ancestor = ancestor.parentElement;
  }

  return result;
}

function resolveMatchedProperties(
  el: HTMLElement,
  tokenTable: TokenTable,
  lineage: LineageResolution,
  inaccessible: boolean,
  mode: "live" | "stable" | InteractionState,
): ResolvedProperty[] {
  const entry = lineage.byElement.get(el)!;
  const result = rowsFromMatches(el, entry.matched, entry.aliases, tokenTable, entry.allMatched);
  const computed = getElementComputedStyle(el);
  if (mode !== "stable") annotatePaintedValues(el, result, computed, inaccessible, mode);

  applyInlineDeclarations(el, result, tokenTable, computed, inaccessible);
  hydratePropertyOpacityRows(result, computed);
  promoteNumericCalcRows(result, tokenTable);
  return resolveInheritedProperties(el, tokenTable, lineage, result, inaccessible);
}

function annotatePaintedValues(
  el: HTMLElement,
  result: ResolvedProperty[],
  computed: CSSStyleDeclaration,
  inaccessible: boolean,
  mode: "live" | InteractionState,
): void {
  for (const prop of result) {
    const cv = computed.getPropertyValue(prop.property);
    if (cv && !/\b(?:var|calc)\s*\(/.test(cv)) {
      // A hypothetical state retains its authored value while `computed`
      // records what the browser is painting. Live and base use painted values.
      if (mode === "live" || mode === "base" || !prop.resolvedValue) prop.resolvedValue = cv;
      prop.computed = cv;
      if (mode === "live") hydratePropertyOpacity(prop, cv);
      const validated = candidateMatchesPainted(el, prop, cv);
      prop.confidence = validated && !inaccessible && !prop.evidence.layer ? "exact" : prop.tokenName ? "probable" : "unknown";
      prop.evidence.inaccessibleStylesheet = inaccessible || undefined;
      prop.evidence.reason = prop.tokenName
        ? (validated ? "authored token declaration validated against computed style" : "authored token candidate could not be proven uniquely")
        : "painted value has no attributable catalog token";
    }
  }
}

export function getResolvedProperties(
  el: HTMLElement,
  tokenTable: TokenTable,
): ResolvedProperty[] {
  const doc = el.ownerDocument ?? document;
  const { rules, inaccessible } = collectCssomRules(doc);
  const lineage = resolveLineage(el, createRuleMatcher(rules, "live"));
  return resolveMatchedProperties(el, tokenTable, lineage, inaccessible, "live");
}

function applyInlineDeclarations(
  el: HTMLElement,
  result: ResolvedProperty[],
  tokenTable: TokenTable,
  computed: CSSStyleDeclaration,
  inaccessible: boolean,
): void {
  // Inline declarations participate in the cascade and are explicit evidence,
  // but token attribution is only exact when the authored inline value uses a known token.
  const inlineProperties = Array.from(el.style);
  const directionality = inlineProperties.some(isLogicalBoxProperty)
    ? directionalityFromComputed(el, computed)
    : undefined;
  for (const property of inlineProperties) {
    const value = el.style.getPropertyValue(property);
    const declarations = resolveDeclaration({
      property,
      value,
      important: el.style.getPropertyPriority(property) === "important",
    }, tokenTable, EMPTY_LOCAL_ALIASES, directionality);
    for (const declaration of declarations) {
      const painted = computed.getPropertyValue(declaration.property);
      const row: ResolvedProperty = {
        property: declaration.property,
        tokenName: declaration.tokenName,
        declaredValue: declaration.declaredValue,
        sourceProperty: declaration.sourceProperty,
        resolvedValue: painted,
        authored: declaration.declaredValue,
        computed: painted,
        tokens: declaration.tokens,
        opacity: declaration.opacity,
        propertyOpacity: declaration.propertyOpacity,
        color: declaration.color,
        modifiers: declaration.modifiers,
        capability: declaration.capability,
        resolvedTokenValue: declaration.resolvedValue,
        diagnostic: declaration.diagnostic,
        structure: declaration.structure,
        confidence: "unknown",
        evidence: { selector: "[style]", specificity: 100000000, important: Boolean(declaration.important), inaccessibleStylesheet: inaccessible || undefined, reason: declaration.tokenName ? "inline token declaration validated against computed style" : "inline declaration contains no catalog token" },
      };
      if (declaration.tokenName && candidateMatchesPainted(el, row, painted)) {
        row.confidence = inaccessible ? "probable" : "exact";
        row.evidence.reason = "inline token declaration validated against computed style";
      }
      const index = result.findIndex((item) => item.property === declaration.property);
      if (index < 0) result.push(row);
      else if (compareCandidate(row, result[index]!) >= 0) result[index] = row;
    }
  }
}

function promoteNumericCalcRows(result: ResolvedProperty[], tokenTable: TokenTable): void {
  // When a calc() expression only references static tokens the browser has
  // already resolved it to a pixel value.  Reclassify the row so the UI
  // shows the pixel value instead of the raw calc() string and allows
  // numeric editing (nudge / token swap).
  for (const prop of result) {
    if (prop.capability !== "raw" || prop.diagnostic) continue;
    const value = prop.authored ?? prop.declaredValue ?? "";
    if (!canBecomeNumeric(value)) continue;
    const numeric = prop.computed ?? prop.resolvedValue ?? "";
    if (!numeric) continue;
    prop.capability = capabilityFor(prop.property, numeric, tokenTable);
  }
}

/**
 * Resolve the authored cascade for a chosen interaction state without relying
 * on the pointer's current location. This is intentionally attribution-first:
 * values with no authored declaration still fall back to the browser's live
 * computed value in the field layer.
 */
export function getResolvedPropertiesForState(
  el: HTMLElement,
  tokenTable: TokenTable,
  state: InteractionState,
): ResolvedProperty[] {
  const doc = el.ownerDocument ?? document;
  const revisions = getDocumentRevisions(doc);
  const { rules, inaccessible } = collectCssomRules(doc);
  const matcher = createRuleMatcher(rules, state);
  const dynamicMatchKey = matcher.dynamicMatchKey(el);
  let snapshots = stateResolutionSnapshots.get(el);
  if (!snapshots) {
    snapshots = new Map();
    stateResolutionSnapshots.set(el, snapshots);
  }
  const cached = snapshots.get(state);
  if (cached
    && cached.elementRevision === revisions.element
    && cached.stylesheetRevision === revisions.stylesheet
    && cached.tokenTable === tokenTable
    && cached.dynamicMatchKey === dynamicMatchKey) {
    return cached.rows;
  }

  const lineage = resolveLineage(el, matcher);
  const rows = resolveMatchedProperties(el, tokenTable, lineage, inaccessible, state);
  registerResolutionLineage(el);
  snapshots.set(state, {
    elementRevision: revisions.element,
    stylesheetRevision: revisions.stylesheet,
    tokenTable,
    dynamicMatchKey,
    rows,
  });
  return rows;
}

const stableTokenCache = new WeakMap<HTMLElement, ResolvedPropertiesSnapshot>();

/**
 * Resolves the cascade with transient interaction selectors removed. Used when
 * an editor must stay linked to the stable token beneath a live :hover/:focus
 * paint. Memoized per (element, revisions, tokenTable).
 */
export function getResolvedPropertiesStable(
  el: HTMLElement,
  tokenTable: TokenTable,
): ResolvedProperty[] {
  const doc = el.ownerDocument ?? document;
  const revisions = getDocumentRevisions(doc);
  const { rules, inaccessible } = collectCssomRules(doc);
  const matcher = createRuleMatcher(rules, "stable");
  const dynamicMatchKey = matcher.dynamicMatchKey(el);
  const cached = stableTokenCache.get(el);
  if (cached
    && cached.elementRevision === revisions.element
    && cached.stylesheetRevision === revisions.stylesheet
    && cached.tokenTable === tokenTable
    && cached.dynamicMatchKey === dynamicMatchKey) {
    return cached.rows;
  }
  const lineage = resolveLineage(el, matcher);
  const rows = resolveMatchedProperties(el, tokenTable, lineage, inaccessible, "stable");
  stableTokenCache.set(el, {
    elementRevision: revisions.element,
    stylesheetRevision: revisions.stylesheet,
    tokenTable,
    dynamicMatchKey,
    rows,
  });
  return rows;
}
