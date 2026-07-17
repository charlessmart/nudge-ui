import type { TokenDefinition, TokenEntry } from "../virtual/design-tokens.ts";

export interface TailwindAlphaMapping {
  utility: string;
  baseName: string;
  alpha: string;
  authored: string;
  confidence: "exact" | "probable" | "unknown";
}

export function detectTailwindV4(css: string): boolean {
  return /@(?:import\s+["']tailwindcss|theme\b)/i.test(css) || /--tw-[\w-]+/.test(css);
}

export function annotateTailwindV4Catalog(catalog: TokenDefinition[], options: { projectTokenNames?: ReadonlySet<string> } = {}): TokenDefinition[] {
  return catalog.map((definition) => {
    const project = options.projectTokenNames?.has(definition.cssName) ?? false;
    return { ...definition, adapter: "tailwind-v4", origin: project ? "project" : "framework", editable: project };
  });
}

export function entriesFromTailwindV4Catalog(catalog: TokenDefinition[]): TokenEntry[] {
  return catalog.map((definition) => ({
    name: definition.name,
    cssName: definition.cssName,
    value: definition.declarations[0]?.value ?? "",
    source: definition.declarations[0]?.source ?? "",
    adapter: definition.adapter ?? "tailwind-v4",
    origin: definition.origin ?? "framework",
    editable: definition.editable,
  }));
}

export function mapTailwindV4ColorOpacity(utility: string): TailwindAlphaMapping | null {
  const match = /^bg-([\w-]+)\/(\d{1,3}%?)$/.exec(utility.trim());
  if (!match) return null;
  const color = match[1];
  const rawAlpha = match[2];
  if (!color || !rawAlpha) return null;
  const numeric = Number(rawAlpha.replace(/%$/, ""));
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return null;
  return { utility, baseName: `--color-${color}`, alpha: `${numeric}%`, authored: utility, confidence: "exact" };
}

export function tailwindV4ColorExpression(baseCssName: string, alpha: string): string {
  return `color-mix(in oklab, var(${baseCssName}) ${alpha}, transparent)`;
}
