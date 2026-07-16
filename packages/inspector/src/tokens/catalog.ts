import type {
  TokenContext,
  TokenDeclaration,
  TokenDefinition,
} from "virtual:design-tokens";
import type { StyleRuleContext } from "../managedStylesheet.ts";

export type TokenCatalogGroup = "color" | "spacing" | "typography" | "radius" | "shadow" | "other";

export const TOKEN_GROUP_LABELS: Record<TokenCatalogGroup, string> = {
  color: "Color",
  spacing: "Spacing",
  typography: "Typography",
  radius: "Radius",
  shadow: "Shadow",
  other: "Other",
};

export const TOKEN_GROUP_ORDER: TokenCatalogGroup[] = [
  "color",
  "spacing",
  "typography",
  "radius",
  "shadow",
  "other",
];

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
}

function defaultRuntime(root: HTMLElement): TokenRuntime {
  return {
    root,
    mediaMatches: (query) => typeof window.matchMedia === "function" ? window.matchMedia(query).matches : false,
    supports: (condition) => typeof CSS !== "undefined" && typeof CSS.supports === "function" ? CSS.supports(condition) : false,
    computedToken: (name) => getComputedStyle(root).getPropertyValue(name).trim(),
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
        return root.matches(start) || root.closest(start) !== null || document.querySelector(start) !== null;
      } catch {
        return false;
      }
    },
  };
}

export function isTokenContextActive(context: TokenContext, runtime: TokenRuntime): boolean {
  if (context.selector && !runtime.selectorMatches(context.selector)) return false;
  if (context.media && !runtime.mediaMatches(context.media)) return false;
  if (context.supports && !runtime.supports(context.supports)) return false;
  if (context.scope && !runtime.scopeMatches(context.scope)) return false;
  return true;
}

function pickWinningDeclaration(
  declarations: TokenDeclaration[],
  runtime: TokenRuntime,
): TokenDeclaration | null {
  const applicable = declarations.filter((declaration) => isTokenContextActive(declaration.context, runtime));
  if (applicable.length === 0) return null;

  const important = applicable.filter((declaration) => declaration.important);
  const candidates = important.length > 0 ? important : applicable;
  const layered = candidates.filter((declaration) => declaration.context.layer);
  const unlayered = candidates.filter((declaration) => !declaration.context.layer);

  // Normal unlayered declarations outrank layered declarations. For important
  // declarations the layer order is reversed, so retain the applicable layered
  // candidates when present. Source order remains the final tiebreaker.
  const cascadePool = important.length > 0
    ? (layered.length > 0 ? layered : unlayered)
    : (unlayered.length > 0 ? unlayered : layered);
  return [...cascadePool].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).at(-1)
    ?? candidates.at(-1)
    ?? null;
}

export function contextLabel(context: TokenContext): string {
  const labels: string[] = [];
  if (context.selector && context.selector !== ":root") labels.push(context.selector);
  else if (context.selector === ":root") labels.push("Default");
  if (context.media) labels.push(`@media ${context.media}`);
  if (context.supports) labels.push(`@supports ${context.supports}`);
  if (context.scope) labels.push(`@scope ${context.scope}`);
  if (context.layer) labels.push(`@layer ${context.layer}`);
  return labels.join(" · ") || "Default";
}

export function sourceParts(source: string): { file: string; line: number } {
  const match = source.match(/^(.*):(\d+)$/);
  return match ? { file: match[1]!, line: Number(match[2]) } : { file: source, line: 0 };
}

export function styleContext(context: TokenContext): StyleRuleContext {
  return {
    media: context.media,
    supports: context.supports,
    scope: context.scope,
    layer: context.layer,
  };
}

export function selectorForContext(context: TokenContext): string {
  return context.selector?.trim() || ":root";
}

function browserRecognizesColor(value: string): boolean {
  if (typeof document === "undefined") return /^#(?:[\da-f]{3,8})$/i.test(value.trim());
  const probe = document.createElement("span");
  probe.style.color = "";
  probe.style.color = value.trim();
  return probe.style.color !== "";
}

export function classifyCatalogToken(name: string, value = ""): TokenCatalogGroup {
  const n = name.toLowerCase();
  if (n.includes("shadow")) return "shadow";
  if (n.includes("radius") || n.includes("rounded")) return "radius";
  if (n.includes("font") || n.includes("type") || n.includes("line-height") || n.includes("letter-spacing")) return "typography";
  if (n.includes("color") || n.includes("foreground") || n.includes("background") || n.includes("surface") || browserRecognizesColor(value)) return "color";
  if (n.includes("space") || n.includes("spacing") || n.includes("gap") || n.includes("size")) return "spacing";
  return "other";
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

export function filterTokenRows(rows: TokenCatalogRow[], query: string): TokenCatalogRow[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return rows;
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

export function compatibleTokenNames(row: TokenCatalogRow, rows: TokenCatalogRow[]): Set<string> {
  const authored = new Map(rows.map((candidate) => [candidate.definition.cssName, candidate.authoredValue]));
  return new Set(rows
    .filter((candidate) => candidate.group === row.group)
    .filter((candidate) => !createsAliasCycle(row.definition.cssName, candidate.definition.cssName, authored))
    .map((candidate) => candidate.definition.cssName));
}
