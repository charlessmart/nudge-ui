import type { TokenEntry } from "../virtual/design-tokens.ts";
import type { TokenAdapter, TokenMapping } from "./types.ts";

export type ThemeContract = Record<string, unknown>;
export type SprinklesClassMap = Record<string, string | { token: string; property?: string }>;

export interface VanillaExtractAdapterOptions {
  themeContract: ThemeContract;
  classMap?: SprinklesClassMap;
  cssValues?: Readonly<Record<string, string>>;
  source?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function walkContract(value: unknown, path: string[], cssValues: Readonly<Record<string, string>>, source: string, out: TokenEntry[]): void {
  if (typeof value === "string") {
    const match = /^var\(\s*(--[\w-]+)/.exec(value);
    if (!match?.[1]) return;
    const cssName = match[1];
    out.push({
      name: path.join("."),
      cssName,
      value: cssValues[cssName] ?? value,
      source,
      adapter: "vanilla-extract",
      origin: "project",
      editable: true,
    });
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, child] of Object.entries(value)) walkContract(child, [...path, key], cssValues, source, out);
}

export function extractVanillaExtractTokens(options: VanillaExtractAdapterOptions): TokenEntry[] {
  const out: TokenEntry[] = [];
  walkContract(options.themeContract, ["theme"], options.cssValues ?? {}, options.source ?? "theme-contract.ts", out);
  return out;
}

export function resolveSprinklesClassName(className: string, options: VanillaExtractAdapterOptions): TokenMapping | null {
  const mapping = options.classMap?.[className];
  if (!mapping) return null;
  const tokenPath = typeof mapping === "string" ? mapping : mapping.token;
  const token = extractVanillaExtractTokens(options).find((entry) => entry.name === tokenPath) ?? null;
  return {
    className,
    token,
    property: typeof mapping === "string" ? undefined : mapping.property,
    confidence: token ? "exact" : "unknown",
    diagnostic: token ? undefined : `class ${className} points to an unknown theme-contract path`,
  };
}

export function createVanillaExtractAdapter(options: VanillaExtractAdapterOptions): TokenAdapter {
  return {
    name: "vanilla-extract",
    detect: () => Object.keys(options.themeContract).length > 0,
    extractTokens: () => extractVanillaExtractTokens(options),
    resolveClassName: (className) => resolveSprinklesClassName(className, options),
  };
}
