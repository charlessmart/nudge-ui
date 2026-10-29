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

function isDefaultContext(context: TokenContext): boolean {
  return (!context.selector || context.selector === ":root") && (context.wrappers ?? []).length === 0;
}

export interface TokenMode {
  /** The declarations' context label, `Default` for the unconditional one. */
  key: string;
  /** How many tokens declare a value in the mode. */
  count: number;
}

/** The contexts a stylesheet's tokens are declared in, the unconditional one first, then the most populated. */
export function tokenModes(rows: readonly TokenCatalogRow[], file: string): TokenMode[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const keys = row.definition.declarations
      .filter((declaration) => declarationFile(declaration) === file)
      .map((declaration) => contextLabel(declaration.context));
    for (const key of new Set(keys)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => Number(b.key === "Default") - Number(a.key === "Default") || b.count - a.count);
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
 * With a `mode`, only the tokens declared in that context, each showing that declaration, so it can be read and edited without being the one in effect.
 * Without one, a token another stylesheet overrides shows this stylesheet's default declaration.
 */
export function scopeRowsToStylesheet(rows: readonly TokenCatalogRow[], file: string, mode: string | null = null): TokenCatalogRow[] {
  return rows.flatMap((row) => {
    const declarations = row.definition.declarations.filter((declaration) =>
      declarationFile(declaration) === file && (mode === null || contextLabel(declaration.context) === mode));
    if (declarations.length === 0) return [];
    const definition = { ...row.definition, declarations };
    if (mode !== null) return [rowWithDeclaration(row, definition, declarations[declarations.length - 1]!)];
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
