import type { TokenEntry } from "../virtual/design-tokens.ts";

export interface TailwindV3Config {
  theme?: { colors?: Record<string, unknown>; extend?: { colors?: Record<string, unknown> } };
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

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function detectTailwindV3Config(config: unknown): config is TailwindV3Config {
  return isPlainRecord(config)
    && isPlainRecord(config.theme)
    && !("contentSource" in config)
    && !("__tailwindVersion" in config && config.__tailwindVersion === 4);
}

function colorEntries(colors: Record<string, unknown>, path: string[] = ["theme", "colors"]): TokenEntry[] {
  const entries: TokenEntry[] = [];
  for (const [key, value] of Object.entries(colors)) {
    const nextPath = [...path, key];
    if (typeof value === "string") {
      entries.push({
        name: nextPath.join("."),
        cssName: `--tw-v3-${nextPath.slice(2).join("-")}`,
        value,
        source: "tailwind.config.js",
        adapter: "tailwind-v3",
        origin: "project",
        editable: true,
      });
    } else if (isPlainRecord(value)) entries.push(...colorEntries(value, nextPath));
  }
  return entries;
}

export function extractTailwindV3Tokens(config: TailwindV3Config): TokenEntry[] {
  const base = isPlainRecord(config.theme?.colors) ? config.theme.colors : {};
  const extend = isPlainRecord(config.theme?.extend?.colors) ? config.theme.extend.colors : {};
  return colorEntries({ ...base, ...extend });
}

function utilityColorName(value: string): string {
  return `theme.colors.${value.replace(/-/g, ".")}`;
}

export function resolveTailwindV3ClassName(className: string, config: TailwindV3Config): TailwindV3Mapping {
  const match = /^bg-([\w-]+?)(?:\/(\d{1,3}%?))?$/.exec(className.trim());
  if (!match) return { className, token: null, alpha: null, authored: className, confidence: "unknown", diagnostic: "unsupported or arbitrary Tailwind v3 utility" };
  const colorName = match[1];
  const alphaRaw = match[2];
  if (!colorName) return { className, token: null, alpha: null, authored: className, confidence: "unknown", diagnostic: "missing configured color" };
  const tokens = extractTailwindV3Tokens(config);
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

export function tailwindV3ColorDeclaration(token: TokenEntry, alphaVariable = "--tw-bg-opacity"): string {
  const value = token.value.trim();
  const hex = /^#([\da-f]{6})$/i.exec(value);
  if (!hex) return `rgb(from ${value} r g b / var(${alphaVariable}))`;
  const rgb = [hex[1]!.slice(0, 2), hex[1]!.slice(2, 4), hex[1]!.slice(4, 6)].map((part) => Number.parseInt(part, 16)).join(" ");
  return `rgb(${rgb} / var(${alphaVariable}))`;
}
