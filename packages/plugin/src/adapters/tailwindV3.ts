import type { TokenEntry } from "../virtual/design-tokens.ts";
import { isRecord as isPlainRecord } from "./isRecord.ts";
import type { TokenAdapter, TokenMapping } from "./types.ts";

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

export interface TailwindV3Mapping {
  className: string;
  token: TokenEntry | null;
  alpha: string | null;
  authored: string;
  confidence: "exact" | "probable" | "unknown";
  diagnostic?: string;
}

export function detectTailwindV3Config(config: unknown): config is TailwindV3Config {
  return isPlainRecord(config)
    && isPlainRecord(config.theme)
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

function mergeThemeSection(
  base: Record<string, unknown>,
  extension: Record<string, unknown>,
) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(extension)) {
    const existing = merged[key];
    merged[key] = isPlainRecord(existing) && isPlainRecord(value)
      ? mergeThemeSection(existing, value)
      : value;
  }
  return merged;
}

function leafValue(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value);
  // Tailwind font-size values may carry line-height metadata as a tuple. The
  // primary value is still a useful catalog entry; the companion belongs to
  // its own lineHeight section when present.
  if (Array.isArray(value) && (typeof value[0] === "string" || typeof value[0] === "number")) return String(value[0]);
  return null;
}

function tokenEntries(
  values: Record<string, unknown>,
  section: TokenSection,
  path: string[] = [],
  source = "tailwind.config.js",
): TokenEntry[] {
  const entries: TokenEntry[] = [];
  for (const [key, value] of Object.entries(values)) {
    const nextPath = [...path, key];
    const leaf = leafValue(value);
    if (leaf !== null) {
      entries.push({
        name: ["theme", section, ...nextPath].join("."),
        // v3 normally compiles configured values directly into utility rules,
        // so this is deliberately a literal managed-preview value, not a
        // fictional custom property.
        value: leaf,
        cssValue: leaf,
        source,
        adapter: "tailwind-v3",
        origin: "project",
        editable: true,
      });
    } else if (isPlainRecord(value)) entries.push(...tokenEntries(value, section, nextPath, source));
  }
  return entries;
}

export function extractTailwindV3Tokens(config: TailwindV3Config, source = "tailwind.config.js"): TokenEntry[] {
  return TOKEN_SECTIONS.flatMap((section) => {
    const base = isPlainRecord(config.theme?.[section]) ? config.theme[section] : {};
    const extend = isPlainRecord(config.theme?.extend?.[section]) ? config.theme.extend[section] : {};
    return tokenEntries(mergeThemeSection(base, extend), section, [], source);
  });
}

function utilityColorName(value: string): string {
  return `theme.colors.${value.replace(/-/g, ".")}`;
}

export function resolveTailwindV3ClassName(
  className: string,
  config: TailwindV3Config,
  source = "tailwind.config.js",
): TailwindV3Mapping {
  const utility = tailwindUtility(className);
  if (!utility || utility.includes("[")) return { className, token: null, alpha: null, authored: className, confidence: "unknown", diagnostic: "unsupported or arbitrary Tailwind v3 utility" };
  const match = /^(bg|text|border|outline|fill|stroke)-([\w-]+?)(?:\/(\d{1,3}%?))?$/.exec(utility);
  if (!match) return { className, token: null, alpha: null, authored: className, confidence: "unknown", diagnostic: "unsupported Tailwind v3 utility" };
  const colorName = match[2];
  const alphaRaw = match[3];
  if (!colorName) return { className, token: null, alpha: null, authored: className, confidence: "unknown", diagnostic: "missing configured color" };
  const tokens = extractTailwindV3Tokens(config, source);
  const token = tokens.find((candidate) => candidate.name === utilityColorName(colorName)
    || candidate.name === `theme.colors.${colorName}`
    || candidate.name.endsWith(`.${colorName}`)) ?? null;
  const alpha = alphaRaw ? `${Number(alphaRaw.replace(/%$/, ""))}%` : null;
  return {
    className,
    token,
    alpha,
    authored: className,
    confidence: token ? "exact" : "unknown",
    diagnostic: token ? undefined : `no static theme.colors entry for ${colorName}`,
  };
}

/** Strip responsive/state variants without being confused by arbitrary-value syntax. */
function tailwindUtility(className: string): string | null {
  let depth = 0;
  let start = 0;
  const trimmed = className.trim().replace(/^!/, "");
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === "[") depth++;
    else if (trimmed[i] === "]") depth = Math.max(0, depth - 1);
    else if (trimmed[i] === ":" && depth === 0) start = i + 1;
  }
  return trimmed.slice(start) || null;
}

export function tailwindV3ColorDeclaration(token: TokenEntry, alphaVariable = "--tw-bg-opacity"): string {
  const value = token.value.trim();
  const hex = /^#([\da-f]{6})$/i.exec(value);
  if (!hex) return `rgb(from ${value} r g b / var(${alphaVariable}))`;
  const rgb = [hex[1]!.slice(0, 2), hex[1]!.slice(2, 4), hex[1]!.slice(4, 6)].map((part) => Number.parseInt(part, 16)).join(" ");
  return `rgb(${rgb} / var(${alphaVariable}))`;
}

export function createTailwindV3Adapter(config: TailwindV3Config, source = "tailwind.config.js"): TokenAdapter {
  return {
    name: "tailwind-v3",
    detect: () => detectTailwindV3Config(config),
    extractTokens: () => extractTailwindV3Tokens(config, source),
    resolveClassName: (className): TokenMapping | null => {
      const mapping = resolveTailwindV3ClassName(className, config, source);
      return mapping.token
        ? { className, token: mapping.token, confidence: mapping.confidence, diagnostic: mapping.diagnostic }
        : null;
    },
  };
}
