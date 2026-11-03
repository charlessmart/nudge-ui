import type {
  TokenContext,
  TokenDeclaration,
  TokenDefinition,
} from "../../css/model/index.ts";
import type { StyleRuleContext } from "../changes/editModel.ts";
import { getScopingSelectorPattern } from "../runtime/runtimeConfig.ts";
import { getElementComputedStyle, getElementWindow } from "../runtime/domRealm.ts";
import { selectTokens } from "../../css/value-semantics/index.ts";
import { parseSingleVarReference } from "../../css/value-semantics/cssSyntax.ts";
import type { TokenGroup } from "../../css/value-semantics/index.ts";
import { cascadeLayerOrder } from "./resolution/cssomCollector.ts";
import { compareAuthorCascade } from "./resolution/cascade.ts";
import { computeSpecificityCore } from "./resolution/selectorSemantics.ts";

export type TokenCatalogGroup = TokenGroup;
export { TOKEN_GROUP_LABELS, TOKEN_GROUP_ORDER } from "../../css/value-semantics/index.ts";

export interface TokenCatalogRow {
  definition: TokenDefinition;
  activeDeclaration: TokenDeclaration | null;
  authoredValue: string;
  resolvedValue: string;
  selector: string;
  styleContext: StyleRuleContext;
  contextLabel: string;
  file: string;
  line: number;
  group: TokenCatalogGroup;
}

export interface TokenRuntime {
  root: HTMLElement;
  mediaMatches(query: string): boolean;
  supports(condition: string): boolean;
  computedToken(name: string): string;
  selectorMatches(selector: string): boolean;
  scopeMatches(scope: string): boolean;
  layerOrder(name: string): number | undefined;
}

function defaultRuntime(root: HTMLElement): TokenRuntime {
  const ownerWindow = getElementWindow(root);
  const ownerDocument = root.ownerDocument;
  const ownerCss = ownerWindow.CSS;
  return {
    root,
    mediaMatches: (query) => typeof ownerWindow.matchMedia === "function" ? ownerWindow.matchMedia(query).matches : false,
    supports: (condition) => typeof ownerCss?.supports === "function" ? ownerCss.supports(condition) : false,
    computedToken: (name) => getElementComputedStyle(root).getPropertyValue(name).trim(),
    selectorMatches: (selector) => selector
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .some((part) => {
        try { return root.matches(part); } catch { return false; }
      }),
    scopeMatches: (scope) => {
      const start = scope.match(/^\s*\((.+)\)/)?.[1]?.trim();
      if (!start) return true;
      try {
        return root.matches(start) || root.closest(start) !== null || ownerDocument.querySelector(start) !== null;
      } catch {
        return false;
      }
    },
    layerOrder: (name) => cascadeLayerOrder(ownerDocument, name),
  };
}

export function isTokenContextActive(context: TokenContext, runtime: TokenRuntime): boolean {
  if (context.selector && !runtime.selectorMatches(context.selector)) return false;
  return (context.wrappers ?? []).every((wrapper) => {
    if (wrapper.kind === "media") return runtime.mediaMatches(wrapper.params);
    if (wrapper.kind === "supports") return runtime.supports(wrapper.params);
    if (wrapper.kind === "scope") return runtime.scopeMatches(wrapper.params);
    return true;
  });
}

function pickWinningDeclaration(
  declarations: TokenDeclaration[],
  runtime: TokenRuntime,
): TokenDeclaration | null {
  const priority = (declaration: TokenDeclaration, index: number) => {
    const layers = (declaration.context.wrappers ?? [])
      .filter((wrapper) => wrapper.kind === "layer")
      .map((wrapper) => wrapper.params.trim())
      .filter(Boolean);
    const layer = layers.length > 0 ? layers.join(".") : undefined;
    return {
      important: declaration.important,
      layer,
      layerOrder: layer ? runtime.layerOrder(layer) : undefined,
      specificity: declaration.context.selector
        ? computeSpecificityCore(declaration.context.selector)
        : 0,
      sourceOrder: declaration.order ?? index,
    };
  };
  let winner: TokenDeclaration | null = null;
  let winnerIndex = -1;
  declarations.forEach((candidate, candidateIndex) => {
    if (!isTokenContextActive(candidate.context, runtime)) return;
    if (
      !winner
      || compareAuthorCascade(
        priority(candidate, candidateIndex),
        priority(winner, winnerIndex),
      ) >= 0
    ) {
      winner = candidate;
      winnerIndex = candidateIndex;
    }
  });
  return winner;
}

/** Strips host-declared scoping markers for labels; `context.selector` keeps the raw selector for matching. */
export function humanizeSelector(selector: string, scopingPattern: RegExp | null): string {
  const stripped = scopingPattern === null ? selector : selector.replace(scopingPattern, "");
  return stripped
    .replace(/:where\(\s*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function contextLabel(context: TokenContext): string {
  const labels: string[] = [];
  if (context.selector && context.selector !== ":root") {
    const selectorLabel = humanizeSelector(context.selector, getScopingSelectorPattern());
    labels.push(selectorLabel === "" || selectorLabel === ":root" ? "Default" : selectorLabel);
  } else if (context.selector === ":root") {
    labels.push("Default");
  }
  for (const wrapper of context.wrappers ?? []) {
    labels.push(`@${wrapper.kind} ${wrapper.params}`);
  }
  return labels.join(" · ") || "Default";
}

export function sourceParts(source: string): { file: string; line: number } {
  const match = source.match(/^(.*):(\d+)$/);
  return match ? { file: match[1]!, line: Number(match[2]) } : { file: source, line: 0 };
}

export function styleContext(context: TokenContext): StyleRuleContext {
  const wrappers = context.wrappers?.map((wrapper) => ({ ...wrapper }));
  return wrappers && wrappers.length > 0 ? { wrappers } : {};
}

export function selectorForContext(context: TokenContext): string {
  return context.selector?.trim() || ":root";
}

export function classifyCatalogToken(name: string, value = ""): TokenCatalogGroup {
  return selectTokens({ entries: [{ name, value, source: "" }] }).candidates[0]?.group ?? "generic";
}

export function buildTokenCatalogRows(
  catalog: TokenDefinition[],
  root: HTMLElement = document.documentElement,
  suppliedRuntime?: TokenRuntime,
): TokenCatalogRow[] {
  const runtime = suppliedRuntime ?? defaultRuntime(root);
  return catalog
    .map((definition) => {
      const activeDeclaration = pickWinningDeclaration(definition.declarations, runtime);
      const source = activeDeclaration?.source ?? definition.declarations[0]?.source ?? "";
      const parts = sourceParts(source);
      const context = activeDeclaration?.context ?? {};
      const authoredValue = activeDeclaration?.value ?? "";
      return {
        definition,
        activeDeclaration,
        authoredValue,
        resolvedValue: activeDeclaration ? runtime.computedToken(definition.cssName) : "",
        selector: selectorForContext(context),
        styleContext: styleContext(context),
        contextLabel: activeDeclaration ? contextLabel(context) : "Inactive in current theme",
        file: parts.file,
        line: parts.line,
        group: classifyCatalogToken(definition.name || definition.cssName, authoredValue),
      };
    })
    .sort((a, b) => a.definition.name.localeCompare(b.definition.name));
}

export interface TokenStylesheet {
  /** The source file of the declarations; empty when a declaration carries no source. */
  file: string;
  /** How many tokens have a declaration in the file. */
  count: number;
}

function declarationFile(declaration: TokenDeclaration): string {
  return sourceParts(declaration.source).file;
}

/** The stylesheets that declare tokens, most populated first; ties keep the order they were first seen in. */
export function tokenStylesheets(rows: readonly TokenCatalogRow[]): TokenStylesheet[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    for (const file of new Set(row.definition.declarations.map(declarationFile))) {
      counts.set(file, (counts.get(file) ?? 0) + 1);
    }
  }
  return [...counts]
    .map(([file, count]) => ({ file, count }))
    .sort((a, b) => b.count - a.count);
}

export const DEFAULT_TOKEN_MODE = "Default";

const ROOT_EQUIVALENT_SELECTORS = new Set(["", ":root", ":host", "html"]);

function selectorParts(selector: string): string[] {
  return humanizeSelector(selector, getScopingSelectorPattern()).split(",").map((part) => part.trim());
}

/** `:root`, `:host`, `html`, or a list of them: each means the whole document, so none narrows where a token applies. */
function isRootEquivalentSelector(selector: string | undefined): boolean {
  return !selector || selectorParts(selector).every((part) => ROOT_EQUIVALENT_SELECTORS.has(part));
}

const PER_ELEMENT_PART = /^(\*|\*?::[a-z-]+|\*?:(before|after))$/i;

/** `*`, `::before`, `::after`, `::backdrop` and the like declare a default on every element, as Tailwind's `--tw-*` properties do. */
export function isPerElementSelector(selector: string | undefined): boolean {
  return selector !== undefined && selectorParts(selector).every((part) => PER_ELEMENT_PART.test(part));
}

/**
 * The mode a declaration belongs to: only the selector, `@media` and `@scope` conditions that choose which design applies.
 * `@layer` orders the cascade and `@supports` picks a fallback for the browser, and root-equivalent selectors are all the document, so they fold into Default,
 * where the declaration in effect is shown and the others stay listed as its variants.
 * Per-element declarations are plumbing rather than a mode, so they join Default whatever wraps them.
 */
export function tokenModeKey(context: TokenContext): string {
  if (isPerElementSelector(context.selector)) return DEFAULT_TOKEN_MODE;
  const labels: string[] = [];
  if (!isRootEquivalentSelector(context.selector)) labels.push(humanizeSelector(context.selector!, getScopingSelectorPattern()));
  for (const wrapper of context.wrappers ?? []) {
    if (wrapper.kind === "media" || wrapper.kind === "scope") labels.push(`@${wrapper.kind} ${wrapper.params}`);
  }
  return labels.join(" · ") || DEFAULT_TOKEN_MODE;
}

function sentenceCase(name: string): string {
  const words = name.replace(/[-_]+/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The theme a selector part names: `.dark`, `.theme-ocean`, `[data-theme="dark"]` or `[data-density=compact]`, on its own or on the root. */
function themeName(part: string): string | null {
  const rest = part
    .replace(/^:host\((.+)\)$/, "$1")
    .replace(/^(:root|:host|html)(?=[.[:])/, "")
    .replace(/^:(where|is)\(([^,()]+)\)$/, "$2");
  const className = rest.match(/^\.(-?[_a-zA-Z][\w-]*)$/)?.[1];
  if (className) return sentenceCase(className.replace(/^theme[-_]+/, ""));
  const attribute = rest.match(/^\[([\w-]+)(?:\s*=\s*["']?([^"'\]]+?)["']?)?\]$/);
  return attribute ? sentenceCase(attribute[2] ?? attribute[1]!.replace(/^data-/, "")) : null;
}

function selectorModeLabel(selector: string): string {
  const names = selectorParts(selector).map(themeName);
  const [first] = names;
  return first && names.every((name) => name === first) ? first : humanizeSelector(selector, getScopingSelectorPattern());
}

const MEDIA_FEATURE_LABELS: Record<string, (value: string) => string | null> = {
  "prefers-color-scheme": (value) => `${sentenceCase(value)} (system)`,
  "prefers-contrast": (value) => value === "more" || value === "high" ? "High contrast" : value === "less" ? "Low contrast" : null,
  "prefers-reduced-motion": (value) => value === "reduce" ? "Reduced motion" : null,
  "forced-colors": (value) => value === "active" ? "Forced colors" : null,
  "min-width": (value) => `≥ ${value}`,
  "max-width": (value) => `≤ ${value}`,
};

/** One plain media feature reads as what it means; anything richer keeps its query. */
function mediaModeLabel(query: string): string {
  const condition = query.trim().replace(/^(only\s+)?screen\s+and\s+/i, "");
  if (/^print$/i.test(condition)) return "Print";
  const feature = condition.match(/^\(\s*([\w-]+)\s*:\s*([^()]+?)\s*\)$/);
  const label = feature ? MEDIA_FEATURE_LABELS[feature[1]!.toLowerCase()]?.(feature[2]!) : null;
  if (label) return label;
  const range = condition.match(/^\(\s*width\s*(>=|<=)\s*([^()]+?)\s*\)$/);
  return range ? `${range[1] === ">=" ? "≥" : "≤"} ${range[2]}` : `@media ${query}`;
}

/** How a mode reads in the picker: `Dark` for `.dark` or `[data-theme="dark"]`, `Dark (system)` for `prefers-color-scheme`. */
export function tokenModeLabel(context: TokenContext): string {
  if (isPerElementSelector(context.selector)) return DEFAULT_TOKEN_MODE;
  const labels: string[] = [];
  if (!isRootEquivalentSelector(context.selector)) labels.push(selectorModeLabel(context.selector!));
  for (const wrapper of context.wrappers ?? []) {
    if (wrapper.kind === "media") labels.push(mediaModeLabel(wrapper.params));
    if (wrapper.kind === "scope") labels.push(`@scope ${wrapper.params}`);
  }
  return labels.join(" · ") || DEFAULT_TOKEN_MODE;
}

/** A token whose value comes only from per-element declarations, listed apart from the design tokens. */
export function isInternalTokenRow(row: TokenCatalogRow): boolean {
  const declarations = row.activeDeclaration ? [row.activeDeclaration] : row.definition.declarations;
  return declarations.length > 0 && declarations.every((declaration) => isPerElementSelector(declaration.context.selector));
}

function isDefaultContext(context: TokenContext): boolean {
  return tokenModeKey(context) === DEFAULT_TOKEN_MODE;
}

export interface TokenMode {
  /** The declarations' mode key, `Default` for the unconditional one. */
  key: string;
  /** How the mode reads in the picker. */
  label: string;
  /** How many tokens declare a value in the mode. */
  count: number;
}

const OPPOSITE_SCHEME: Record<string, string> = { Dark: "Light", Light: "Dark" };

/**
 * Names Default for the scheme it stands in for when the other modes are only the opposite one (a `.dark` beside it makes it Light),
 * and keeps two modes that read the same apart by their source.
 */
function finishModeLabels(modes: TokenMode[]): TokenMode[] {
  const schemes = new Set<string | undefined>(modes
    .filter((mode) => mode.key !== DEFAULT_TOKEN_MODE)
    .map((mode) => OPPOSITE_SCHEME[mode.label.replace(/ \(system\)$/, "")]));
  const defaultLabel = schemes.size === 1 && !schemes.has(undefined) ? [...schemes][0]! : DEFAULT_TOKEN_MODE;
  const labelled = modes.map((mode) => mode.key === DEFAULT_TOKEN_MODE ? { ...mode, label: defaultLabel } : mode);
  const uses = new Map<string, number>();
  for (const mode of labelled) uses.set(mode.label, (uses.get(mode.label) ?? 0) + 1);
  return labelled.map((mode) => (uses.get(mode.label) ?? 0) > 1 && mode.label !== mode.key
    ? { ...mode, label: `${mode.label} (${mode.key})` }
    : mode);
}

/** The modes a stylesheet's tokens are declared in, the unconditional one first, then the most populated. */
export function tokenModes(rows: readonly TokenCatalogRow[], file: string): TokenMode[] {
  const counts = new Map<string, number>();
  const labels = new Map<string, string>();
  for (const row of rows) {
    const contexts = row.definition.declarations
      .filter((declaration) => declarationFile(declaration) === file)
      .map((declaration) => declaration.context);
    const keys = new Set<string>();
    for (const context of contexts) {
      const key = tokenModeKey(context);
      keys.add(key);
      if (!labels.has(key)) labels.set(key, tokenModeLabel(context));
    }
    for (const key of keys) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return finishModeLabels([...counts]
    .map(([key, count]) => ({ key, label: labels.get(key) ?? key, count }))
    .sort((a, b) => Number(b.key === DEFAULT_TOKEN_MODE) - Number(a.key === DEFAULT_TOKEN_MODE) || b.count - a.count));
}

function rowWithDeclaration(row: TokenCatalogRow, definition: TokenDefinition, declaration: TokenDeclaration): TokenCatalogRow {
  const parts = sourceParts(declaration.source);
  return {
    ...row,
    definition,
    activeDeclaration: declaration,
    authoredValue: declaration.value,
    resolvedValue: declaration === row.activeDeclaration ? row.resolvedValue : declaration.value,
    selector: selectorForContext(declaration.context),
    styleContext: styleContext(declaration.context),
    contextLabel: contextLabel(declaration.context),
    file: parts.file,
    line: parts.line,
  };
}

/**
 * The tokens one stylesheet declares, each reduced to that stylesheet's own declarations.
 * With a `mode`, only the tokens declared in that mode, each showing the declaration in effect when it is one of them, otherwise the last,
 * so it can be read and edited without being the one in effect; the mode's other declarations of the token stay listed as variants.
 * Without one, a token another stylesheet overrides shows this stylesheet's default declaration.
 */
export function scopeRowsToStylesheet(rows: readonly TokenCatalogRow[], file: string, mode: string | null = null): TokenCatalogRow[] {
  return rows.flatMap((row) => {
    const declarations = row.definition.declarations.filter((declaration) =>
      declarationFile(declaration) === file && (mode === null || tokenModeKey(declaration.context) === mode));
    if (declarations.length === 0) return [];
    const definition = { ...row.definition, declarations };
    if (mode !== null) {
      const shown = row.activeDeclaration && declarations.includes(row.activeDeclaration)
        ? row.activeDeclaration
        : declarations[declarations.length - 1]!;
      return [rowWithDeclaration(row, definition, shown)];
    }
    if (!row.activeDeclaration || declarations.includes(row.activeDeclaration)) return [{ ...row, definition }];

    const declaration = declarations.find((candidate) => isDefaultContext(candidate.context));
    if (declaration) return [rowWithDeclaration(row, definition, declaration)];
    const parts = sourceParts(declarations[0]!.source);
    return [{
      ...row,
      definition,
      activeDeclaration: null,
      authoredValue: "",
      resolvedValue: "",
      selector: ":root",
      styleContext: {},
      contextLabel: "Inactive in current theme",
      file: parts.file,
      line: parts.line,
    }];
  });
}

export function filterTokenRows(rows: readonly TokenCatalogRow[], query: string): TokenCatalogRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...rows];
  return rows.filter((row) =>
    row.definition.name.toLowerCase().includes(needle)
    || row.definition.cssName.toLowerCase().includes(needle)
    || row.definition.declarations.some((declaration) => declaration.value.toLowerCase().includes(needle)),
  );
}

/** An alias is a whole-string reference with no fallback; a fallback changes the value. */
export function aliasName(value: string): string | null {
  const reference = parseSingleVarReference(value);
  return reference && reference.fallback === undefined ? reference.name : null;
}

export function createsAliasCycle(
  tokenName: string,
  candidateName: string,
  authoredValues: ReadonlyMap<string, string>,
): boolean {
  const visited = new Set<string>([tokenName]);
  let current: string | null = candidateName;
  while (current) {
    if (visited.has(current)) return true;
    visited.add(current);
    current = aliasName(authoredValues.get(current) ?? "");
  }
  return false;
}

export function compatibleTokenNames(row: TokenCatalogRow, rows: readonly TokenCatalogRow[]): Set<string> {
  const authored = new Map(rows.map((candidate) => [candidate.definition.cssName, candidate.authoredValue]));
  return new Set(rows
    .filter((candidate) => candidate.group === row.group)
    .filter((candidate) => !createsAliasCycle(row.definition.cssName, candidate.definition.cssName, authored))
    .map((candidate) => candidate.definition.cssName));
}
