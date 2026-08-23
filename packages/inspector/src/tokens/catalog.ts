import type {
  TokenContext,
  TokenDeclaration,
  TokenDefinition,
} from "virtual:design-tokens";
import type { StyleRuleContext } from "../managedStylesheet.ts";
import { getElementComputedStyle, getElementWindow } from "../domRealm.ts";
import {
  selectTokens,
  TOKEN_GROUP_LABELS,
  TOKEN_GROUP_ORDER,
} from "@design-tool/css/value-semantics";
import type { TokenGroup } from "@design-tool/css/value-semantics";
import { cascadeLayerOrder } from "./resolution/cssomCollector.ts";
import { compareAuthorCascade } from "./resolution/cascade.ts";
import { computeSpecificityCore } from "./resolution/selectorSemantics.ts";

export type TokenCatalogGroup = TokenGroup;
export { TOKEN_GROUP_LABELS, TOKEN_GROUP_ORDER } from "@design-tool/css/value-semantics";

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

/**
 * Astro compiles component-scoped styles with structural scoping markers:
 * `[data-astro-cid-<hash>]` attribute selectors (attribute strategy) or
 * `.astro-<hash>` classes (class strategy). ADR-0011: the hashes are opaque
 * structure — the raw selector is retained in `context.selector` so resolution
 * keeps matching the rendered DOM, but human-facing labels and prompts must
 * present only author vocabulary.
 *
 * The `.astro-` prefix is reserved by Astro for class-strategy scoping, so any
 * author class starting with it is treated as structural. Documented
 * assumption, not an attempt to hash-match.
 */
export function stripScopingHashes(selector: string): string {
  return selector
    .replace(/\[data-astro-cid-[^\]]*\]/g, "")
    .replace(/\.astro-[a-zA-Z0-9_-]+/g, "")
    // A :where(...) wrapper left empty by the removals disappears entirely.
    .replace(/:where\(\s*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function contextLabel(context: TokenContext): string {
  const labels: string[] = [];
  if (context.selector && context.selector !== ":root") {
    const selectorLabel = stripScopingHashes(context.selector);
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
    .filter((definition) => !definition.cssName.startsWith("--dt-"))
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

export function filterTokenRows(rows: readonly TokenCatalogRow[], query: string): TokenCatalogRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...rows];
  return rows.filter((row) =>
    row.definition.name.toLowerCase().includes(needle)
    || row.definition.cssName.toLowerCase().includes(needle)
    || row.definition.declarations.some((declaration) => declaration.value.toLowerCase().includes(needle)),
  );
}

const EXACT_ALIAS = /^var\(\s*(--[\w-]+)\s*\)$/;

export function aliasName(value: string): string | null {
  return value.trim().match(EXACT_ALIAS)?.[1] ?? null;
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
