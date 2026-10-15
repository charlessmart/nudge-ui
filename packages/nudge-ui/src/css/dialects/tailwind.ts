import type { TokenEntry } from "../model/index.ts";
import type { TokenContribution } from "../token-inventory/types.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function detectTailwindV4(css: string): boolean {
  return /@(?:import\s+["']tailwindcss|theme\b)/i.test(css) || /--tw-[\w-]+/.test(css);
}

/** The generic parser cannot tell authored from generated v4 tokens, so this corrects provenance and editability. */
export function tailwindV4Relabelling(): TokenContribution {
  return {
    id: "tailwind-v4-naming",
    order: 0,
    relabellings: [
      { adapter: "tailwind-v4", fromOrigin: "project", origin: "project", editable: true },
      { adapter: "tailwind-v4", fromOrigin: "generated", origin: "framework", editable: false },
    ],
  };
}

/** A color utility that applies alpha to a catalog token, e.g. `bg-brand/40`. */
export interface TailwindAlphaUtility {
  readonly utility: string;
  readonly baseName: string;
  /** Normalized alpha, always percent-suffixed. */
  readonly alpha: string;
}

const V4_ALPHA_UTILITY = /^bg-([\w-]+)\/(\d{1,3}%?)$/;

/** Parsed by both the build-time catalog and the browser runtime, which must agree on attribution. */
export function readTailwindV4AlphaUtility(className: string): TailwindAlphaUtility | null {
  const match = V4_ALPHA_UTILITY.exec(className.trim());
  const color = match?.[1];
  const rawAlpha = match?.[2];
  if (color === undefined || rawAlpha === undefined) return null;

  const numeric = Number(rawAlpha.replace(/%$/, ""));
  if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) return null;

  return { utility: className, baseName: `--color-${color}`, alpha: `${numeric}%` };
}

export function tailwindV4AlphaExpression(baseCssName: string, alpha: string): string {
  return `color-mix(in oklab, var(${baseCssName}) ${alpha}, transparent)`;
}

export interface TailwindV3Config {
  theme?: {
    colors?: Record<string, unknown>;
    spacing?: Record<string, unknown>;
    borderWidth?: Record<string, unknown>;
    borderRadius?: Record<string, unknown>;
    fontSize?: Record<string, unknown>;
    fontWeight?: Record<string, unknown>;
    lineHeight?: Record<string, unknown>;
    letterSpacing?: Record<string, unknown>;
    extend?: Record<string, Record<string, unknown>>;
  };
  plugins?: unknown[];
  [key: string]: unknown;
}

export function isTailwindV3Config(config: unknown): config is TailwindV3Config {
  return isRecord(config)
    && isRecord(config.theme)
    && !("contentSource" in config)
    && !("__tailwindVersion" in config && config.__tailwindVersion === 4);
}

const TOKEN_SECTIONS = [
  "colors",
  "spacing",
  "borderWidth",
  "borderRadius",
  "fontSize",
  "fontWeight",
  "lineHeight",
  "letterSpacing",
] as const;

type TokenSection = typeof TOKEN_SECTIONS[number];

function mergeSection(
  base: Record<string, unknown>,
  extension: Record<string, unknown>,
) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(extension)) {
    const existing = merged[key];
    merged[key] = isRecord(existing) && isRecord(value) ? mergeSection(existing, value) : value;
  }
  return merged;
}

function leafValue(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value);
  // A font-size may be a [size, lineHeight] tuple; the companion belongs to the lineHeight section.
  const first = Array.isArray(value) ? value[0] : undefined;
  if (typeof first === "string" || typeof first === "number") return String(first);
  return null;
}

function sectionEntries(
  values: Record<string, unknown>,
  section: TokenSection,
  source: string,
  path: readonly string[] = [],
): TokenEntry[] {
  const entries: TokenEntry[] = [];
  for (const [key, value] of Object.entries(values)) {
    const nextPath = [...path, key];
    const leaf = leafValue(value);
    if (leaf !== null) {
      entries.push({
        name: ["theme", section, ...nextPath].join("."),
        // v3 compiles values into utility rules, so this is a literal, not a custom property.
        value: leaf,
        cssValue: leaf,
        source,
        adapter: "tailwind-v3",
        origin: "project",
        editable: true,
      });
    } else if (isRecord(value)) {
      entries.push(...sectionEntries(value, section, source, nextPath));
    }
  }
  return entries;
}

export function readTailwindV3Config(
  config: TailwindV3Config,
  source = "tailwind.config.js",
): TokenEntry[] {
  return TOKEN_SECTIONS.flatMap((section) => {
    const base = isRecord(config.theme?.[section]) ? config.theme[section] : {};
    const extend = isRecord(config.theme?.extend?.[section]) ? config.theme.extend[section] : {};
    return sectionEntries(mergeSection(base, extend), section, source);
  });
}
