import type { TokenDefinition, TokenEntry } from "../virtual/design-tokens.ts";
import type { TokenContribution } from "@design-tool/css/token-inventory";
import type { TokenAdapter } from "./types.ts";

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

/**
 * Deterministic Tailwind v4 naming policy for the styling-Adapter seam. This
 * is a pure function of one aggregated definition, contributed to the token
 * inventory as an overlay so the inventory snapshot already carries the final
 * `adapter`/`origin`/`editable` labels without the Vite adapter post-processing
 * the snapshot.
 *
 * The token inventory reconciles authored vs transformed observations into a
 * generic provenance (`project`/`package`/`generated`) and tags rows from
 * Tailwind v4 artifacts with `adapter: "tailwind-v4"`. This policy consumes
 * ONLY the reconciled row — never hook timing or mutable maps — and applies
 * Tailwind's remaining naming:
 *
 * - project-authored rows stay `project` and become editable;
 * - rows the compiler emitted (inventory provenance `generated`) are labelled
 *   `framework` and stay non-editable;
 * - package rows are preserved verbatim (never relabelled).
 */
export function tailwindV4NamingOverlay(definition: TokenDefinition): TokenDefinition {
  if (definition.adapter !== "tailwind-v4" || definition.origin === "package") return definition;
  const project = definition.origin === "project";
  return {
    ...definition,
    origin: project ? "project" : "framework",
    editable: project,
  };
}

/**
 * The Tailwind v4 naming contribution. Id-keyed and replaceable, so repeated
 * applications are no-ops and the inventory generation only bumps when the
 * reconciled facts actually change.
 */
export function createTailwindV4NamingContribution(): TokenContribution {
  return {
    id: "tailwind-v4-naming",
    order: 0,
    overlay: tailwindV4NamingOverlay,
  };
}

/**
 * @deprecated Compatibility projection over `tailwindV4NamingOverlay`; kept
 * for callers of the 2.4 reconciled-catalog seam. The plugin now feeds
 * `createTailwindV4NamingContribution()` into the inventory instead.
 */
export function annotateTailwindV4ReconciledCatalog(catalog: readonly TokenDefinition[]): TokenDefinition[] {
  return catalog.map(tailwindV4NamingOverlay);
}

export function entriesFromTailwindV4Catalog(catalog: TokenDefinition[]): TokenEntry[] {
  return catalog.map((definition) => ({
    name: definition.name,
    cssName: definition.cssName,
    value: definition.declarations[0]?.value ?? "",
    source: definition.declarations[0]?.source ?? "",
    cssValue: definition.cssValue,
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

/**
 * Tailwind v4's tokens already exist in emitted CSS, so this adapter only
 * enriches parser rows; it intentionally contributes no duplicate rows.
 */
export function createTailwindV4Adapter(css: string): TokenAdapter {
  return {
    name: "tailwind-v4",
    detect: () => detectTailwindV4(css),
    extractTokens: () => [],
  };
}
