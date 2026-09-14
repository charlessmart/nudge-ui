import type { TokenDefinition, TokenEntry } from "@nudge-ui/css/model";
import { readTailwindV4AlphaUtility, tailwindV4AlphaExpression } from "@nudge-ui/css/dialects";
import { INTERACTION_STATES } from "../shell/styleState.ts";
import type { InteractionState } from "../shell/styleState.ts";
import { getElementComputedStyle } from "../runtime/domRealm.ts";
import {
  collectRules as collectCssomRules,
  documentRevisions as getDocumentRevisions,
  registerResolutionElement,
} from "./resolution/cssomCollector.ts";
import { computeSpecificity } from "./resolution/selectorSemantics.ts";
import { compareAuthorCascade } from "./resolution/cascade.ts";
export { invalidateStyleResolutionCache } from "./resolution/cssomCollector.ts";
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
} from "@nudge-ui/css/model";
import {
  interpretValue,
  normalizeOpacityPercent,
  type Directionality,
  type InterpretedValueField,
} from "@nudge-ui/css/value-semantics";
import { createInspectorValueContext, inspectorTokenOrigin } from "./valueSemanticsAdapter.ts";
import { getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";

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

const tokenTableMemo = new WeakMap<readonly TokenEntry[], TokenTable>();

export function buildTokenTable(entries: readonly TokenEntry[]): TokenTable {
  const cached = tokenTableMemo.get(entries);
  if (cached) return cached;
  const table: TokenTable = {};
  for (const entry of entries) {
    table[entry.name] = entry;
    if (entry.cssName) table[entry.cssName] = entry;
  }
  tokenTableMemo.set(entries, table);
  return table;
}

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

let tableCache: TokenTable | null = null;
let tableSource: readonly TokenEntry[] | null = null;

export function getTokenTable(): TokenTable {
  const { tokens } = getNudgeUiRuntimeConfig();
  if (tableCache !== null && tableSource === tokens) return tableCache;
  tableCache = buildTokenTable(tokens);
  tableSource = tokens;
  return tableCache;
}

function isCustomPropertyToken(definition: TokenDefinition): boolean {
  return definition.cssName.startsWith("--");
}

function entryFromDefinition(definition: TokenDefinition, value: string): TokenEntry {
  return {
    name: definition.name,
    cssName: definition.cssName,
    value,
    source: definition.declarations[0]?.source ?? "",
    cssValue: definition.cssValue,
    adapter: definition.adapter,
    origin: definition.origin,
    editable: definition.editable,
  };
}

interface TokenEntriesCacheEntry {
  elementRevision: number;
  stylesheetRevision: number;
  definitions: readonly TokenDefinition[];
  entries: TokenEntry[];
}

const tokenEntriesCache = new WeakMap<HTMLElement, TokenEntriesCacheEntry>();

function registerWithAncestors(el: HTMLElement): void {
  let current: HTMLElement | null = el;
  while (current) {
    registerResolutionElement(current);
    current = current.parentElement;
  }
}

/**
 * The build-time catalog is intentionally an inventory of every project token.
 * Element edits must instead use only custom properties resolved in that
 * element's cascade; a token defined by a lazy stylesheet is not usable until
 * that stylesheet is attached to the document. Entries are cached per element
 * until the element or stylesheet revision changes; the derived table reuses
 * `buildTokenTable`'s input-identity memo.
 */
export function getAvailableTokenEntriesForElement(
  el: HTMLElement,
  definitions: readonly TokenDefinition[] = getNudgeUiRuntimeConfig().tokenCatalog,
): TokenEntry[] {
  const revisions = getDocumentRevisions(el.ownerDocument ?? document);
  const cached = tokenEntriesCache.get(el);
  if (cached && cached.elementRevision === revisions.element
    && cached.stylesheetRevision === revisions.stylesheet
    && cached.definitions === definitions) {
    return cached.entries;
  }
  registerWithAncestors(el);
  const computed = getElementComputedStyle(el);
  const available = definitions.flatMap((definition) => {
    if (!isCustomPropertyToken(definition)) {
      // Literal adapters (for example Tailwind v3) do not have a browser
      // custom property to probe. Their adapter owns their availability.
      return [entryFromDefinition(definition, definition.declarations[0]?.value ?? "")];
    }
    const value = computed.getPropertyValue(definition.cssName).trim();
    return value ? [entryFromDefinition(definition, value)] : [];
  });
  const intermediateTable = buildTokenTable(available);
  const entries = available.map((entry) => ({
    ...entry,
    value: resolveTokenValue(entry.value, intermediateTable).resolvedValue,
  }));
  tokenEntriesCache.set(el, {
    elementRevision: revisions.element,
    stylesheetRevision: revisions.stylesheet,
    definitions,
    entries,
  });
  return entries;
}



/**
 * Replaces build-time token declaration hints with declarations serialized by
 * the browser from the stylesheets currently attached to this document.
 */
function hydrateTokenCatalogFromCssom(
  definitions: readonly TokenDefinition[],
  doc: Document = document,
): TokenDefinition[] {
  const needsHydration = (definition: TokenDefinition): boolean =>
    definition.declarations.length === 0
    || (definition.adapter === "vanilla-extract" && definition.declarations.every((declaration) =>
      declaration.value.trim() === `var(${definition.cssName})`
      && !declaration.context.selector
      && !declaration.context.wrappers?.length));
  const known = new Set(definitions.filter(needsHydration).map((definition) => definition.cssName));
  const declarations = new Map<string, TokenDefinition["declarations"]>();
  for (const rule of collectCssomRules(doc).rules) {
    if (rule.source === "#nudge-ui-styles") continue;
    for (const declaration of rule.declarations) {
      if (!known.has(declaration.property)) continue;
      const wrappers = [
        ...(rule.layer ? [{ kind: "layer" as const, params: rule.layer }] : []),
        ...(rule.atRules ?? []).flatMap((atRule) =>
          atRule.kind === "media" || atRule.kind === "supports"
            ? [{ kind: atRule.kind, params: atRule.params }]
            : []),
      ];
      const list = declarations.get(declaration.property) ?? [];
      list.push({
        id: `${declaration.property}\u0000${rule.source ?? "cssom"}\u0000${rule.sourceOrder ?? list.length}`,
        order: rule.sourceOrder,
        value: declaration.value,
        source: rule.source ?? "cssom",
        important: Boolean(declaration.important),
        context: {
          selector: rule.selectorText,
          ...(wrappers.length > 0 ? { wrappers } : {}),
        },
      });
      declarations.set(declaration.property, list);
    }
  }
  return definitions.map((definition) => {
    if (!needsHydration(definition)) return definition;
    const accepted = declarations.get(definition.cssName);
    return accepted?.length ? { ...definition, declarations: accepted } : definition;
  });
}

function sourceFile(source: string): string {
  return source.replace(/:\d+$/, "").split(/[?#]/, 1)[0] ?? source;
}

function normalizedPath(value: string): string {
  return decodeURIComponent(value).replace(/\\/g, "/").replace(/^file:\/\//, "").replace(/\/+$/, "");
}

interface LoadedStylesheetSource {
  readonly path: string;
  readonly providesAuthoredIdentity: boolean;
}

function loadedStylesheetSources(doc: Document): LoadedStylesheetSource[] {
  const sourceIdentityByPath = new Map<string, boolean>();
  for (const node of doc.querySelectorAll<HTMLStyleElement | HTMLLinkElement>(
    'style[data-vite-dev-id], link[rel~="stylesheet"][href]',
  )) {
    const providesAuthoredIdentity = node.tagName === "STYLE";
    const source = providesAuthoredIdentity
      ? (node as HTMLStyleElement).dataset.viteDevId
      : node.getAttribute("href");
    if (!source) continue;
    const path = normalizedPath(source.split(/[?#]/, 1)[0] ?? source);
    sourceIdentityByPath.set(
      path,
      providesAuthoredIdentity || sourceIdentityByPath.get(path) === true,
    );
  }
  return Array.from(sourceIdentityByPath, ([path, providesAuthoredIdentity]) => ({
    path,
    providesAuthoredIdentity,
  }));
}

function isLoadedCssSource(source: string, loadedSources: string[]): boolean {
  const file = sourceFile(source);
  if (!/\.css$/i.test(file) || loadedSources.length === 0) return true;
  const normalizedFile = normalizedPath(file);
  return loadedSources.some((loaded) => loaded === normalizedFile
    || loaded.endsWith(`/${normalizedFile}`)
    || normalizedFile.endsWith(`/${loaded}`));
}

/**
 * Returns stylesheet identities only when the browser gave us a complete,
 * authored-source mapping. A compiled host can expose a mixture of source-like
 * and opaque CSS URLs; treating the mapped subset as complete would make
 * declarations behind the opaque URLs look lazy even while their variables are
 * live in the document.
 */
function confidentlyLoadedStylesheetSources(
  definitions: readonly TokenDefinition[],
  loadedSources: readonly LoadedStylesheetSource[],
): string[] {
  const cssSources = definitions.flatMap((definition) =>
    definition.declarations
      .map((declaration) => declaration.source)
      .filter((source) => /\.css$/i.test(sourceFile(source))));
  const known = new Set<string>();
  for (const loaded of loadedSources) {
    if (loaded.providesAuthoredIdentity
      || cssSources.some((source) => isLoadedCssSource(source, [loaded.path]))) {
      known.add(loaded.path);
      continue;
    }
    // One opaque compiled URL can contain any authored declaration, so the
    // document does not provide enough evidence to remove unloaded sources.
    return [];
  }
  return [...known];
}

/**
 * Produces the page catalog used by the global Tokens settings section. It retains the
 * build-time inventory separately, while removing declarations from CSS files
 * that have not loaded when the document exposes mappable source identities
 * (such as Vite's lazy route stylesheets). Opaque compiled URLs do not narrow
 * the adapter-supplied catalog.
 */
export function getAvailableTokenCatalog(
  root: HTMLElement = document.documentElement,
  definitions: readonly TokenDefinition[] = getNudgeUiRuntimeConfig().tokenCatalog,
): TokenDefinition[] {
  const computed = getElementComputedStyle(root);
  const hydrated = hydrateTokenCatalogFromCssom(definitions, root.ownerDocument ?? document);
  const loadedSources = confidentlyLoadedStylesheetSources(
    hydrated,
    loadedStylesheetSources(root.ownerDocument ?? document),
  );
  return hydrated.flatMap((definition) => {
    if (!isCustomPropertyToken(definition)) return [definition];
    if (!computed.getPropertyValue(definition.cssName).trim()) return [];
    const declarations = definition.declarations.filter((declaration) =>
      isLoadedCssSource(declaration.source, loadedSources));
    return declarations.length > 0 ? [{ ...definition, declarations }] : [];
  });
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
 * inspector's integration context. Used by the token-availability path; the
 * value Module is the sole interpretation authority.
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

function specificityForBranch(rule: Pick<MatchedRule, "selectorText" | "specificity">, branch: string): number {
  // Single-branch selectors reuse the specificity collected from CSSOM; the
  // matched branch is the whole selector. Multi-branch selectors need the
  // matched branch's own weight, so recompute per branch.
  return rule.selectorText.includes(",") ? computeSpecificity(branch) : rule.specificity;
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
      const branch = matchingSelectorBranch(element, rule.selectorText);
      if (!branch) return;
      const sourceOrder = rule.sourceOrder ?? index;
      const specificity = specificityForBranch(rule, branch);
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

interface ElementMatch {
  rule: MatchedRule;
  /** The selector actually used for matching (state-stripped for interaction states). */
  selectorText: string;
  branch: string;
  specificity: number;
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

/**
 * The selector set used by a resolution. Interaction states strip or drop
 * pseudo-class rules, `live` keeps the raw CSSOM rules (used by
 * `getResolvedProperties`), and `stable` drops transient rules (used by
 * `getResolvedPropertiesStable`).
 */
type CascadeTransform = InteractionState | "live" | "stable";

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

const TRANSIENT_SELECTOR = /:(?:hover|active|focus|focus-visible|focus-within|visited|target)(?:\b|\()/;

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
      .filter((rule) => !TRANSIENT_SELECTOR.test(rule.selectorText))
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

function isElementSensitiveSelector(selector: string): boolean {
  let attributeDepth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = 0; index < selector.length; index++) {
    const character = selector[index]!;
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (attributeDepth > 0) {
      if (character === '"' || character === "'") quote = character;
      else if (character === "[") attributeDepth++;
      else if (character === "]") attributeDepth--;
      continue;
    }
    if (character === "[") {
      attributeDepth = 1;
      continue;
    }
    if (character === "+" || character === "~") return true;
    if (character !== ":") continue;
    if (selector[index + 1] === ":") return true;
    const pseudo = /^[A-Za-z-]+/.exec(selector.slice(index + 1))?.[0];
    // :root is represented by the complete ancestor lineage. Other
    // pseudo-classes can vary per concrete element without an attribute or
    // sibling mutation (for example :checked, :visited, and :target).
    if (pseudo && pseudo.toLowerCase() !== "root") return true;
  }
  return false;
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
// The "all matched" set (inactive rules included) is matched fresh against
// every lineage element on every resolution otherwise, duplicating the
// cached sweep's cost. State-independent selectors use the same revision-keyed
// memo shape as the active sweep. Element-sensitive selectors stay fresh: a
// checked state, sibling relationship, or similar browser state can change
// without a DOM mutation that this registry observes.
const allMatchesMemo = new WeakMap<HTMLElement, Map<CascadeTransform, SourceSiteMatchCacheEntry>>();

/** Test hook: clears the per-source-site matched-rule cache. */
export function resetSourceSiteMatchCache(): void {
  sourceSiteMatchCaches = new WeakMap();
  sourceSiteMatchCacheEntries = 0;
}

/** Test hook: number of distinct cached source-site match sets. */
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

function matchRuleForElement(el: HTMLElement, entry: { rule: MatchedRule; selectorText: string }): ElementMatch | null {
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
): string {
  const entries = sourceSiteMatchBuckets(rules, transform).elementSensitive;
  if (entries.length === 0) return "";
  const matches: string[] = [];
  let current: HTMLElement | null = el;
  let depth = 0;
  while (current) {
    for (const entry of entries) {
      const branch = matchingSelectorBranch(current, entry.selectorText);
      if (branch) matches.push(`${depth}:${entry.rule.sourceOrder ?? 0}:${branch}`);
    }
    current = current.parentElement;
    depth++;
  }
  return matches.join("\u0001");
}

/**
 * Matches every transformed rule against one element. For elements carrying a
 * source-site identity (`data-cid`) the selector-match result is cached per
 * `(document, data-cid, data-src, data-projection-instance, transform, element and
 * stylesheet revision, context)` so repeated selections and equivalent sibling instances of the
 * same source site reuse the matched rule set. Elements without a stable
 * identity, or selectors that depend on unsupported relationships, are matched
 * fresh on every call.
 */
function getCachedElementMatches(el: HTMLElement, rules: MatchedRule[], transform: CascadeTransform): ElementMatch[] {
  const { cacheable, elementSensitive } = sourceSiteMatchBuckets(rules, transform);
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
    const sensitiveMatches = elementSensitive.length > 0 ? collect(elementSensitive) : [];
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
  // Match element-sensitive selectors on every resolution. Browser state such
  // as `checked`, `target`, or a sibling relationship can change without a DOM
  // or stylesheet revision, so a revision-keyed entry can return stale rows.
  const elementMatches = elementSensitive.length > 0 ? collect(elementSensitive) : [];
  return elementMatches.length === 0 ? cachedMatches : [...cachedMatches, ...elementMatches];
}

/**
 * Matches selectors without applying conditional wrappers. Resolution still
 * uses the active-only set for cascade decisions; this set preserves inactive
 * media-query alternatives for property attribution in the inspector.
 * Memoized per (element, transform, revisions) like the cached sweep for
 * state-independent selectors. Element-sensitive selectors stay fresh because
 * their state can change without a revision bump (for example, `:checked`),
 * and the "live" transform always keeps its raw selector set fresh.
 */
function getAllElementMatches(el: HTMLElement, rules: MatchedRule[], transform: CascadeTransform): ElementMatch[] {
  if (transform === "live") {
    return rulesForTransform(rules, transform).flatMap((entry) => {
      const match = matchRuleForElement(el, entry);
      return match ? [match] : [];
    });
  }
  const { cacheable, elementSensitive } = sourceSiteMatchBuckets(rules, transform);
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
  const sensitiveMatches = elementSensitive.length > 0 ? collect(elementSensitive) : [];
  return sensitiveMatches.length === 0 ? cachedMatches : [...cachedMatches, ...sensitiveMatches];
}

/**
 * One matching pass over the rules for the element and its ancestors, with the
 * selector-match results shared between the element's own resolution and the
 * inherited phase. Local aliases are collected per element so no ancestor
 * re-walks the lineage × rules.
 */
function resolveLineage(el: HTMLElement, rules: MatchedRule[], transform: CascadeTransform): LineageResolution {
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
    selectorMatches.set(element, getCachedElementMatches(element, rules, transform));
    allSelectorMatches.set(element, getAllElementMatches(element, rules, transform));
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

// Selector branch splits are pure functions of the selector text and repeat
// for every element and resolution sweep. Memoize them so repeated matching
// passes skip re-scanning the same selector strings. Bounded like the other
// match caches; the snapshot's selector set is finite per stylesheet revision.
const SELECTOR_SPLIT_CACHE_MAX = 8192;
const selectorSplitMemo = new Map<string, string[]>();

// The matched branch for one (element, selector) pair is a pure function of
// the element's selector-relevant state and the CSSOM snapshot — except for
// selectors whose match depends on transient state the revisions cannot see
// (`:hover`, `:checked`, sibling combinators, …). Those keep the freshness
// contract of the element-sensitive bucket and are matched uncached.
// Resolution sweeps re-match the same state-independent selector strings
// against the same lineage elements across cascades (authored base, stable,
// interaction states) and across the active/all rule sets, so memoizing the
// branch turns repeat sweeps into cache hits. Invalidation follows the
// document revisions, the same strategy as the per-element match caches.
const ELEMENT_BRANCH_CACHE_MAX = 16384;
const elementBranchMemo = new WeakMap<Element, Map<string, {
  elementRevision: number;
  stylesheetRevision: number;
  branch: string | null;
}>>();

function isBranchMemoizable(selectorText: string): boolean {
  return !TRANSIENT_SELECTOR.test(selectorText) && !isElementSensitiveSelector(selectorText);
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
    branches = splitTopLevel(selectorText, ",");
    if (selectorSplitMemo.size >= SELECTOR_SPLIT_CACHE_MAX) selectorSplitMemo.clear();
    selectorSplitMemo.set(selectorText, branches);
  }
  let branch: string | null = null;
  for (const candidate of branches) {
    try {
      if (el.matches(candidate.trim())) {
        branch = candidate.trim();
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

// Splits CSS values at top-level combinators or an optional delimiter.
function splitTopLevel(s: string, sep?: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "(") depth++;
    else if (s[i] === ")") depth--;
    else if (depth === 0 && sep && s[i] === sep) {
      parts.push(s.slice(start, i));
      start = i + 1;
    } else if (depth === 0 && !sep && (s[i] === " " || s[i] === ">" || s[i] === "+" || s[i] === "~")) {
      // Only split on combinators that have non-space around them
      // If previous char was also a combinator, skip
      if (i > start) {
        parts.push(s.slice(start, i).trim());
      }
      start = i + 1;
    }
  }
  const last = s.slice(start).trim();
  if (last) parts.push(last);
  return parts;
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

export function getResolvedProperties(
  el: HTMLElement,
  tokenTable: TokenTable,
): ResolvedProperty[] {
  const doc = el.ownerDocument ?? document;
  const { rules, inaccessible } = collectCssomRules(doc);
  const lineage = resolveLineage(el, rules, "live");
  const entry = lineage.byElement.get(el)!;
  const result = rowsFromMatches(el, entry.matched, entry.aliases, tokenTable, entry.allMatched);
  const computed = getElementComputedStyle(el);
  for (const prop of result) {
    const cv = computed.getPropertyValue(prop.property);
    if (cv && !/\b(?:var|calc)\s*\(/.test(cv)) {
      prop.resolvedValue = cv;
      prop.computed = cv;
      hydratePropertyOpacity(prop, cv);
      const validated = candidateMatchesPainted(el, prop, cv);
      prop.confidence = validated && !inaccessible && !prop.evidence.layer ? "exact" : prop.tokenName ? "probable" : "unknown";
      prop.evidence.inaccessibleStylesheet = inaccessible || undefined;
      prop.evidence.reason = prop.tokenName
        ? (validated ? "authored token declaration validated against computed style" : "authored token candidate could not be proven uniquely")
        : "painted value has no attributable catalog token";
    }
  }

  applyInlineDeclarations(el, result, tokenTable, computed, inaccessible);
  hydratePropertyOpacityRows(result, computed);
  promoteNumericCalcRows(result, tokenTable);
  return resolveInheritedProperties(el, tokenTable, lineage, result, inaccessible);
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

const INTERACTION_SELECTOR = /:(hover|active|focus-visible|focus|disabled)(?:\b|\()/g;

function selectorForState(selector: string, state: InteractionState): string | null {
  const states = new Set<string>();
  INTERACTION_SELECTOR.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INTERACTION_SELECTOR.exec(selector)) !== null) states.add(match[1]!);
  if (state === "base") return states.size === 0 ? selector : null;
  if (!states.has(state)) return states.size === 0 ? selector : null;
  // CSSOM cannot ask the browser whether a hypothetical pseudo-class matches.
  // Removing interaction pseudo-classes gives the authored rule a stable
  // element match for inspection. The real rule remains untouched.
  return selector.replace(INTERACTION_SELECTOR, "");
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
  const dynamicMatchKey = elementSensitiveMatchKey(el, rules, state);
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

  const lineage = resolveLineage(el, rules, state);
  const entry = lineage.byElement.get(el)!;
  const result = rowsFromMatches(el, entry.matched, entry.aliases, tokenTable, entry.allMatched);
  const computed = getElementComputedStyle(el);
  for (const prop of result) {
    const cv = computed.getPropertyValue(prop.property);
    if (cv && !/\b(?:var|calc)\s*\(/.test(cv)) {
      // A selected interaction state is hypothetical: the element may still
      // be painting its Base styles. `rowsFromMatches` has already resolved
      // the authored declaration for the requested state, so preserve that
      // value for editor controls and keep the live CSSOM value in `computed`.
      if (state === "base" || !prop.resolvedValue) prop.resolvedValue = cv;
      prop.computed = cv;
      const validated = candidateMatchesPainted(el, prop, cv);
      prop.confidence = validated && !inaccessible && !prop.evidence.layer ? "exact" : prop.tokenName ? "probable" : "unknown";
      prop.evidence.inaccessibleStylesheet = inaccessible || undefined;
      prop.evidence.reason = prop.tokenName
        ? (validated ? "authored token declaration validated against computed style" : "authored token candidate could not be proven uniquely")
        : "painted value has no attributable catalog token";
    }
  }
  applyInlineDeclarations(el, result, tokenTable, computed, inaccessible);
  hydratePropertyOpacityRows(result, computed);
  promoteNumericCalcRows(result, tokenTable);
  const rows = resolveInheritedProperties(el, tokenTable, lineage, result, inaccessible);
  registerWithAncestors(el);
  snapshots.set(state, {
    elementRevision: revisions.element,
    stylesheetRevision: revisions.stylesheet,
    tokenTable,
    dynamicMatchKey,
    rows,
  });
  return rows;
}

/**
 * Interaction states whose pseudo-class substring appears in at least one
 * snapshot selector, memoized per CSSOM snapshot. The availability check for a
 * state is `matched.some((m) => m.rule.selectorText.includes(":state"))`, so a
 * state whose substring appears nowhere can never become available for any
 * element; skipping its per-state match sweep is exactly equivalent and
 * removes the dominant cost of re-scanning interaction states after every
 * stylesheet revision.
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

const stableTokenCache = new WeakMap<HTMLElement, {
  elementRevision: number;
  stylesheetRevision: number;
  tokenTable: TokenTable;
  dynamicMatchKey: string;
  rows: ResolvedProperty[];
}>();

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
  const dynamicMatchKey = elementSensitiveMatchKey(el, rules, "stable");
  const cached = stableTokenCache.get(el);
  if (cached
    && cached.elementRevision === revisions.element
    && cached.stylesheetRevision === revisions.stylesheet
    && cached.tokenTable === tokenTable
    && cached.dynamicMatchKey === dynamicMatchKey) {
    return cached.rows;
  }
  const lineage = resolveLineage(el, rules, "stable");
  const entry = lineage.byElement.get(el)!;
  const result = rowsFromMatches(el, entry.matched, entry.aliases, tokenTable, entry.allMatched);
  const computed = getElementComputedStyle(el);
  applyInlineDeclarations(el, result, tokenTable, computed, inaccessible);
  hydratePropertyOpacityRows(result, computed);
  promoteNumericCalcRows(result, tokenTable);
  const rows = resolveInheritedProperties(el, tokenTable, lineage, result, inaccessible);
  stableTokenCache.set(el, {
    elementRevision: revisions.element,
    stylesheetRevision: revisions.stylesheet,
    tokenTable,
    dynamicMatchKey,
    rows,
  });
  return rows;
}
