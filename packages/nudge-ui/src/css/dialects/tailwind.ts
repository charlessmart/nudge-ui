import type { TokenEntry } from "../model/index.ts";
import type { TokenContribution } from "../token-inventory/types.ts";
import type { StylingDialect } from "./dialect.ts";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `--tw-*` helpers are not evidence: Tailwind v3 emits them too. */
export function detectTailwindV4(css: string): boolean {
  return /@import\s+["']tailwindcss(?:\/[\w-]+)?["']|@theme\b/i.test(css);
}

/** v4 still accepts `@tailwind utilities`, so its own markers win. */
export function detectTailwindV3(css: string): boolean {
  return /@tailwind\s+(?:base|components|utilities)\b/.test(css) && !detectTailwindV4(css);
}

type UtilityPrefixes = Readonly<Record<string, string>>;

const COLOR_UTILITIES: UtilityPrefixes = {
  "background-color": "bg",
  background: "bg",
  color: "text",
  "border-color": "border",
  "border-top-color": "border-t",
  "border-right-color": "border-r",
  "border-bottom-color": "border-b",
  "border-left-color": "border-l",
  "outline-color": "outline",
  "text-decoration-color": "decoration",
  "accent-color": "accent",
  "caret-color": "caret",
  fill: "fill",
  stroke: "stroke",
};

const SPACING_UTILITIES: UtilityPrefixes = {
  padding: "p",
  "padding-top": "pt",
  "padding-right": "pr",
  "padding-bottom": "pb",
  "padding-left": "pl",
  "padding-inline": "px",
  "padding-block": "py",
  "padding-inline-start": "ps",
  "padding-inline-end": "pe",
  margin: "m",
  "margin-top": "mt",
  "margin-right": "mr",
  "margin-bottom": "mb",
  "margin-left": "ml",
  "margin-inline": "mx",
  "margin-block": "my",
  "margin-inline-start": "ms",
  "margin-inline-end": "me",
  gap: "gap",
  "row-gap": "gap-y",
  "column-gap": "gap-x",
  width: "w",
  height: "h",
  "min-width": "min-w",
  "max-width": "max-w",
  "min-height": "min-h",
  "max-height": "max-h",
  inset: "inset",
  top: "top",
  right: "right",
  bottom: "bottom",
  left: "left",
};

const RADIUS_UTILITIES: UtilityPrefixes = {
  "border-radius": "rounded",
  "border-top-left-radius": "rounded-tl",
  "border-top-right-radius": "rounded-tr",
  "border-bottom-right-radius": "rounded-br",
  "border-bottom-left-radius": "rounded-bl",
};

const BORDER_WIDTH_UTILITIES: UtilityPrefixes = {
  "border-width": "border",
  "border-top-width": "border-t",
  "border-right-width": "border-r",
  "border-bottom-width": "border-b",
  "border-left-width": "border-l",
};

const FONT_SIZE_UTILITIES: UtilityPrefixes = { "font-size": "text" };
const FONT_WEIGHT_UTILITIES: UtilityPrefixes = { "font-weight": "font" };
const FONT_FAMILY_UTILITIES: UtilityPrefixes = { "font-family": "font" };
const LINE_HEIGHT_UTILITIES: UtilityPrefixes = { "line-height": "leading" };
const LETTER_SPACING_UTILITIES: UtilityPrefixes = { "letter-spacing": "tracking" };
const SHADOW_UTILITIES: UtilityPrefixes = { "box-shadow": "shadow" };

function utilityName(prefixes: UtilityPrefixes, property: string, key: string): string | null {
  const prefix = prefixes[property];
  if (prefix === undefined || key === "") return null;
  return key === "DEFAULT" ? prefix : `${prefix}-${key}`;
}

/** v3 theme sections, keyed as `readTailwindV3Config` names them. */
const V3_SECTION_UTILITIES: Readonly<Record<string, UtilityPrefixes>> = {
  colors: COLOR_UTILITIES,
  spacing: SPACING_UTILITIES,
  borderRadius: RADIUS_UTILITIES,
  borderWidth: BORDER_WIDTH_UTILITIES,
  fontSize: FONT_SIZE_UTILITIES,
  fontWeight: FONT_WEIGHT_UTILITIES,
  lineHeight: LINE_HEIGHT_UTILITIES,
  letterSpacing: LETTER_SPACING_UTILITIES,
};

/** `theme.colors.blue.500` with `background-color` is `bg-blue-500`. */
export function tailwindV3Utility(tokenName: string, property: string): string | null {
  const [root, section, ...path] = tokenName.split(".");
  const prefixes = section === undefined ? undefined : V3_SECTION_UTILITIES[section];
  if (root !== "theme" || !prefixes || path.length === 0) return null;
  if (section !== "colors") return utilityName(prefixes, property, path.join("."));
  // Only colors nest; other sections keep dotted keys such as spacing `0.5`. `blue.DEFAULT` is `bg-blue`.
  const parts = path[path.length - 1] === "DEFAULT" ? path.slice(0, -1) : path;
  return utilityName(prefixes, property, parts.join("-") || "DEFAULT");
}

/** v4 theme namespaces, longest first so `--font-weight-` is not read as a font family. */
const V4_NAMESPACE_UTILITIES: ReadonlyArray<readonly [string, UtilityPrefixes]> = [
  ["--font-weight-", FONT_WEIGHT_UTILITIES],
  ["--tracking-", LETTER_SPACING_UTILITIES],
  ["--leading-", LINE_HEIGHT_UTILITIES],
  ["--spacing-", SPACING_UTILITIES],
  ["--shadow-", SHADOW_UTILITIES],
  ["--radius-", RADIUS_UTILITIES],
  ["--color-", COLOR_UTILITIES],
  ["--text-", FONT_SIZE_UTILITIES],
  ["--font-", FONT_FAMILY_UTILITIES],
];

/** `--color-brand` with `background-color` is `bg-brand`. */
export function tailwindV4Utility(cssName: string, property: string): string | null {
  for (const [namespace, prefixes] of V4_NAMESPACE_UTILITIES) {
    if (!cssName.startsWith(namespace)) continue;
    const key = cssName.slice(namespace.length);
    // `--text-lg--line-height` is a companion of `--text-lg`, not a utility of its own.
    return key.includes("--") ? null : utilityName(prefixes, property, key);
  }
  return null;
}

function isTailwindHelperProperty(name: string): boolean {
  return name.startsWith("--tw-");
}

export const tailwindV3Dialect: StylingDialect = {
  name: "tailwind-v3",
  label: "Tailwind v3",
  detectStylesheet: detectTailwindV3,
  tokenOrigin: "framework",
  // v3 compiles config values into utility rules, so a token is a literal, not a custom property.
  literalTokens: true,
  declaredOnPage: false,
  isInternalProperty: isTailwindHelperProperty,
  sourceForm: (token, property) => tailwindV3Utility(token.name, property),
};

export const tailwindV4Dialect: StylingDialect = {
  name: "tailwind-v4",
  label: "Tailwind v4",
  detectStylesheet: detectTailwindV4,
  tokenOrigin: "framework",
  literalTokens: false,
  declaredOnPage: false,
  isInternalProperty: isTailwindHelperProperty,
  readClass: (className) => {
    const utility = readTailwindV4AlphaUtility(className);
    return utility && {
      properties: ["background-color", "background"],
      tokenCssName: utility.baseName,
      expression: tailwindV4AlphaExpression(utility.baseName, utility.alpha),
      alpha: utility.alpha,
    };
  },
  sourceForm: (token, property) => tailwindV4Utility(token.cssName ?? token.name, property),
};

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
