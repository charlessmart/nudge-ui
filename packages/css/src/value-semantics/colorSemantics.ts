/**
 * Color value semantics (plan slice 3.4).
 *
 * One browser-safe Module owns color format recognition, embedded-alpha
 * detection, opacity modifier interpretation, `color-mix()` handling, color
 * token replacement, and meaning-preserving opacity edits. Interpretation
 * takes explicit token knowledge (a token table, local aliases, and an
 * optional token-reference resolver) and never touches the DOM or CSSOM.
 *
 * Interface invariants:
 * - interpretation never throws on arbitrary input;
 * - edits either preserve the authored meaning or return an explicit
 *   `ok: false` result — never a plausible but lossy string;
 * - token-plus-alpha and opacity-token distinctions survive swaps;
 * - framework-specific attribution (Tailwind v3 direct literals and `--tw-*`
 *   aliases) stays behind the injected `resolveTokenReference` context.
 */
import type { ColorOpacity, ColorValueFacts, TokenEntry, TokenReference, TokenTable } from "../model/index.ts";
import { extractVarCalls, splitTopLevel, splitTopLevelWhitespace, topLevelSlashIndex } from "./cssSyntax.ts";

/** The resolved facts about one token-backed component of a color expression. */
export interface ColorComponentResolution {
  tokenName: string | null;
  resolvedValue: string;
  tokens: TokenReference[];
}

/** Explicit, DOM-free facts the color interpretation needs. */
export interface ColorSemanticsContext {
  /** Resolved token table (custom-property name → entry). */
  tokenTable: TokenTable;
  /** Local aliases collected from the selected element's cascade. */
  localAliases?: ReadonlyMap<string, string>;
  /**
   * Resolves a `var()` component (for example an opacity token) to its
   * concrete value and attribution. Supplied by the token interpretation so
   * alias and framework attribution stay in one place. Absent → token-backed
   * components fall back to local aliases, fallbacks, or the raw text.
   */
  resolveTokenReference?: (value: string) => ColorComponentResolution | null;
}

/**
 * A meaning-preserving color edit. `ok: true` carries the rewritten value;
 * `ok: false` reports explicitly that the transformation cannot be
 * represented faithfully. Callers must treat `ok: false` as "no change".
 */
export type ColorEditResult =
  | { ok: true; value: string }
  | { ok: false; reason: "unsupported" | "invalid-opacity" };

/** One high-level color interpretation consumed by token interpretation and UI projection. */
export interface ColorValueInterpretation {
  opacity?: ColorOpacity;
  facts: ColorValueFacts;
}

const MIX_PERCENTAGE_OR_TOKEN = /^(?:\d+\.?\d*|\.\d+)%$|^var\([\s\S]+\)$/i;

const COLOR_FUNCTIONS_WITH_ALPHA_SYNTAX = new Set(["rgb", "hsl", "hwb", "lab", "lch", "oklab", "oklch", "color"]);

const CSS_NUMBER = /^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:e[+-]?\d+)?$/i;

function formatOpacityPercent(value: number): string {
  return `${String(Number(value.toFixed(4)))}%`;
}

function parseOpacityPercent(value: string, clamp = true): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const isPercent = trimmed.endsWith("%");
  const numericText = isPercent ? trimmed.slice(0, -1).trim() : trimmed;
  if (!CSS_NUMBER.test(numericText)) return null;
  const numeric = Number(numericText);
  if (!Number.isFinite(numeric)) return null;
  const percent = isPercent ? numeric : numeric * 100;
  return clamp ? Math.max(0, Math.min(100, percent)) : percent;
}

/**
 * Normalizes an authored opacity to a clamped percent string. Accepts `%`
 * and `0..1` forms; returns null when the input is not a parseable opacity.
 */
export function normalizeOpacityPercent(value: string): string | null {
  const percent = parseOpacityPercent(value);
  return percent === null ? null : formatOpacityPercent(percent);
}

interface ColorMixItem {
  color: string;
  percentage: string | null;
}

function parseColorMixItem(value: string): ColorMixItem {
  const parts = splitTopLevelWhitespace(value.trim());
  if (parts.length > 1 && MIX_PERCENTAGE_OR_TOKEN.test(parts.at(-1)!)) {
    return { color: parts.slice(0, -1).join(" "), percentage: parts.at(-1)! };
  }
  if (parts.length > 1 && MIX_PERCENTAGE_OR_TOKEN.test(parts[0]!)) {
    return { color: parts.slice(1).join(" "), percentage: parts[0]! };
  }
  return { color: value.trim(), percentage: null };
}

/**
 * Resolves an alpha component that may be a token-backed `var(...)`, a local
 * alias, or a literal fallback. Token attribution comes from the injected
 * resolver; the module itself only consults local aliases and the raw text.
 */
interface ResolvedOpacityPercentage {
  component: Pick<ColorOpacity, "value" | "authoredValue" | "tokenName" | "token">;
  percent: number;
}

function isExactVarFunction(value: string): boolean {
  if (!/^var\(/i.test(value)) return false;
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (quote) {
      if (char === quote && value[index - 1] !== "\\") quote = null;
      continue;
    }
    if (char === '"' || char === "'") quote = char;
    else if (char === "(") depth++;
    else if (char === ")") {
      depth--;
      if (depth === 0) return index === value.length - 1;
    }
  }
  return false;
}

function resolveOpacityPercentage(
  authoredValue: string,
  ctx: ColorSemanticsContext,
  clamp = true,
): ResolvedOpacityPercentage | null {
  const trimmed = authoredValue.trim();
  const exactVar = isExactVarFunction(trimmed);
  const tokenResult = exactVar ? ctx.resolveTokenReference?.(trimmed) ?? null : null;
  const localName = exactVar ? extractVarCalls(trimmed)[0]?.name : undefined;
  const localValue = localName ? ctx.localAliases?.get(localName) : undefined;
  const fallback = exactVar ? extractVarCalls(trimmed)[0]?.fallback : undefined;
  const resolved = localValue
    ?? (tokenResult?.resolvedValue && !/^var\(/i.test(tokenResult.resolvedValue)
      ? tokenResult.resolvedValue
      : fallback ?? trimmed);
  const percent = parseOpacityPercent(resolved, clamp);
  if (percent === null) return null;
  const token = tokenResult?.tokens.find((candidate) => candidate.name === tokenResult.tokenName)
    ?? tokenResult?.tokens[0];
  return {
    percent,
    component: {
      value: formatOpacityPercent(percent),
      authoredValue: trimmed,
      tokenName: tokenResult?.tokenName ?? null,
      token,
    },
  };
}

function resolveOpacityComponent(
  authoredValue: string,
  ctx: ColorSemanticsContext,
): Pick<ColorOpacity, "value" | "authoredValue" | "tokenName" | "token"> | null {
  return resolveOpacityPercentage(authoredValue, ctx)?.component ?? null;
}

/**
 * Derives the alpha component of a `color-mix(...)` whose second argument
 * reconciles a color against `transparent`. The component is the color item's
 * percentage, or the 100−p mirror of the transparent item's percentage when
 * only that one is authored.
 */
function resolveColorMixOpacity(value: string, ctx: ColorSemanticsContext): ColorOpacity | undefined {
  const open = value.indexOf("(");
  const close = value.lastIndexOf(")");
  if (open < 0 || close <= open) return undefined;
  const parts = splitTopLevel(value.slice(open + 1, close), ",");
  if (parts.length !== 3 || !/^\s*in\s+/i.test(parts[0]!)) return undefined;

  const items = parts.slice(1).map(parseColorMixItem);
  const transparentIndex = items.findIndex((item) => item.color.toLowerCase() === "transparent");
  if (transparentIndex < 0 || items.filter((item) => item.color.toLowerCase() === "transparent").length !== 1) return undefined;
  const colorIndex = transparentIndex === 0 ? 1 : 0;
  const colorItem = items[colorIndex]!;
  const transparentItem = items[transparentIndex]!;

  const colorPercentage = colorItem.percentage
    ? resolveOpacityPercentage(colorItem.percentage, ctx, false)
    : null;
  const transparentPercentage = transparentItem.percentage
    ? resolveOpacityPercentage(transparentItem.percentage, ctx, false)
    : null;
  if ((colorItem.percentage && !colorPercentage) || (transparentItem.percentage && !transparentPercentage)) return undefined;

  let colorWeight = colorPercentage?.percent;
  let transparentWeight = transparentPercentage?.percent;
  if (colorWeight === undefined && transparentWeight === undefined) {
    colorWeight = 50;
    transparentWeight = 50;
  } else if (colorWeight === undefined) {
    if (transparentWeight! < 0 || transparentWeight! > 100) return undefined;
    colorWeight = 100 - transparentWeight!;
  } else if (transparentWeight === undefined) {
    if (colorWeight < 0 || colorWeight > 100) return undefined;
    transparentWeight = 100 - colorWeight;
  }
  const resolvedColorWeight = colorWeight;
  const resolvedTransparentWeight = transparentWeight;
  if (resolvedColorWeight === undefined || resolvedTransparentWeight === undefined) return undefined;
  if (resolvedColorWeight < 0 || resolvedTransparentWeight < 0) return undefined;
  const total = resolvedColorWeight + resolvedTransparentWeight;
  if (total <= 0) return undefined;
  const effectivePercent = total < 100 ? resolvedColorWeight : (resolvedColorWeight / total) * 100;
  const attribution = colorPercentage?.component ?? transparentPercentage?.component;
  return {
    value: formatOpacityPercent(effectivePercent),
    authoredValue: attribution?.authoredValue ?? "50%",
    tokenName: attribution?.tokenName ?? null,
    token: attribution?.token,
    source: "color-mix",
  };
}

/**
 * Interprets the alpha component of one authored color value. Returns a
 * `ColorOpacity` when the value carries a recognized alpha channel (hex,
 * rgb/hsl, or color-mix against transparent), and undefined otherwise.
 */
export function interpretColorOpacity(value: string, ctx: ColorSemanticsContext): ColorOpacity | undefined {
  const trimmed = value.trim();
  const hex = /^#([\da-f]{4}|[\da-f]{8})$/i.exec(trimmed);
  if (hex) {
    const raw = hex[1]!;
    const alpha = raw.length === 4 ? raw.slice(-1) : raw.slice(-2);
    const max = raw.length === 4 ? 15 : 255;
    return {
      value: formatOpacityPercent((Number.parseInt(alpha, 16) / max) * 100),
      authoredValue: alpha,
      source: "hex",
      tokenName: null,
    };
  }

  const colorFunction = /^(rgba?|hsla?)\(([\s\S]*)\)$/i.exec(trimmed);
  if (colorFunction) {
    const body = colorFunction[2]!;
    const commaParts = splitTopLevel(body, ",");
    const alpha = commaParts.length >= 4
      ? commaParts[3]!
      : (() => {
        const slash = topLevelSlashIndex(body);
        return slash >= 0 ? body.slice(slash + 1).trim() : null;
      })();
    if (alpha) {
      const component = resolveOpacityComponent(alpha, ctx);
      if (component) {
        return { ...component, source: colorFunction[1]!.toLowerCase().startsWith("rgb") ? "rgb" : "hsl" };
      }
    }
  }

  if (/^color-mix\(/i.test(trimmed)) return resolveColorMixOpacity(trimmed, ctx);
  return undefined;
}

/** Returns whether a color value carries its own alpha channel. */
export function colorValueHasEmbeddedAlpha(value: string): boolean {
  const trimmed = value.trim();
  if (/^transparent$/i.test(trimmed)) return true;
  if (/^#(?:[\da-f]{4}|[\da-f]{8})$/i.test(trimmed)) return true;

  const colorFunction = /^([a-z-]+)\(([\s\S]*)\)$/i.exec(trimmed);
  if (!colorFunction) return false;
  const name = colorFunction[1]!.toLowerCase();
  const body = colorFunction[2]!;
  if (name === "rgba" || name === "hsla") return true;
  if (COLOR_FUNCTIONS_WITH_ALPHA_SYNTAX.has(name)) {
    if (topLevelSlashIndex(body) >= 0) return true;
    if ((name === "rgb" || name === "hsl") && splitTopLevel(body, ",").length >= 4) return true;
  }
  if (name !== "color-mix") return false;

  const parts = splitTopLevel(body, ",");
  return parts.length === 3 && parts.slice(1).some((part) => {
    const item = parseColorMixItem(part);
    return item.color.toLowerCase() === "transparent" || colorValueHasEmbeddedAlpha(item.color);
  });
}

/** Interprets UI-relevant color shape through the value-semantics seam. */
export function interpretColorValue(value: string, ctx: ColorSemanticsContext): ColorValueInterpretation {
  const trimmed = value.trim();
  return {
    opacity: interpretColorOpacity(trimmed, ctx),
    facts: {
      hasEmbeddedAlpha: colorValueHasEmbeddedAlpha(trimmed),
      isExpression: /^color-mix\(/i.test(trimmed),
      opacityEditable: applyColorOpacity(trimmed, "50%").ok,
    },
  };
}

function replaceFunctionOpacity(value: string, opacity: string): string | null {
  const open = value.indexOf("(");
  const close = value.lastIndexOf(")");
  if (open < 0 || close <= open) return null;
  const body = value.slice(open + 1, close);
  const commaParts = splitTopLevel(body, ",");
  if (commaParts.length >= 4) {
    return `${value.slice(0, open + 1)}${commaParts.slice(0, 3).map((part) => part.trim()).join(", ")}, ${opacity}${value.slice(close)}`;
  }
  const slash = topLevelSlashIndex(body);
  if (slash < 0) return null;
  return `${value.slice(0, open + 1)}${body.slice(0, slash).trim()} / ${opacity}${value.slice(close)}`;
}

function isOpaqueRgbOrHslFunction(value: string): boolean {
  const match = /^(?:rgba?|hsla?)\(([\s\S]*)\)$/i.exec(value);
  if (!match) return false;
  const body = match[1]!;
  if (topLevelSlashIndex(body) >= 0) return false;
  const commaParts = splitTopLevel(body, ",");
  return commaParts.length === 3
    || (commaParts.length === 1 && splitTopLevelWhitespace(body).length === 3);
}

function replaceColorMixItemPercentage(item: string, opacity: string): string {
  const parts = splitTopLevelWhitespace(item.trim());
  if (parts.length > 1 && MIX_PERCENTAGE_OR_TOKEN.test(parts.at(-1)!)) {
    return [...parts.slice(0, -1), opacity].join(" ");
  }
  if (parts.length > 1 && MIX_PERCENTAGE_OR_TOKEN.test(parts[0]!)) {
    return [opacity, ...parts.slice(1)].join(" ");
  }
  return `${item.trim()} ${opacity}`;
}

function replaceColorMixOpacity(value: string, opacity: string): string | null {
  const open = value.indexOf("(");
  const close = value.lastIndexOf(")");
  if (open < 0 || close <= open) return null;
  const parts = splitTopLevel(value.slice(open + 1, close), ",");
  if (parts.length !== 3 || !/^\s*in\s+/i.test(parts[0]!)) return null;
  const items = parts.slice(1).map(parseColorMixItem);
  const transparentIndex = items.findIndex((item) => item.color.toLowerCase() === "transparent");
  if (transparentIndex < 0 || items.filter((item) => item.color.toLowerCase() === "transparent").length !== 1) return null;
  const colorIndex = transparentIndex === 0 ? 1 : 0;
  const updated = [...parts];
  const colorItem = items[colorIndex]!;
  const transparentItem = items[transparentIndex]!;
  if (colorItem.percentage && transparentItem.percentage) {
    const percent = parseOpacityPercent(opacity);
    if (percent === null) return null;
    updated[colorIndex + 1] = replaceColorMixItemPercentage(parts[colorIndex + 1]!, formatOpacityPercent(percent));
    updated[transparentIndex + 1] = replaceColorMixItemPercentage(parts[transparentIndex + 1]!, formatOpacityPercent(100 - percent));
  } else if (colorItem.percentage) {
    updated[colorIndex + 1] = replaceColorMixItemPercentage(parts[colorIndex + 1]!, opacity);
  } else if (transparentItem.percentage) {
    const percent = parseOpacityPercent(opacity);
    if (percent === null) return null;
    updated[transparentIndex + 1] = replaceColorMixItemPercentage(parts[transparentIndex + 1]!, formatOpacityPercent(100 - percent));
  } else {
    updated[colorIndex + 1] = `${parts[colorIndex + 1]!.trim()} ${opacity}`;
  }
  return `${value.slice(0, open + 1)}${updated.join(", ")}${value.slice(close)}`;
}

/**
 * Rewrites the alpha of a supported color expression to a normalized opacity
 * percent. Hex alpha channels are rewritten digit-for-digit, rgb/hsl slash or
 * comma alpha is replaced, `color-mix(... transparent)` reconciles its
 * percentage (or its 100−p mirror), and a bare `var()` wraps into
 * `color-mix(in srgb, var(...) <pct>, transparent)` — unwrapping back to the
 * plain `var()` when the opacity reaches 100%. Unsupported value shapes and
 * unparseable opacities return an explicit `ok: false`.
 */
export function applyColorOpacity(value: string, opacity: string): ColorEditResult {
  const normalized = normalizeOpacityPercent(opacity);
  if (normalized === null) return { ok: false, reason: "invalid-opacity" };
  const trimmed = value.trim();
  if (/^var\(\s*--[\w-]+(?:\s*,[\s\S]*)?\s*\)$/i.test(trimmed)) {
    return normalized === "100%"
      ? { ok: true, value: trimmed }
      : { ok: true, value: `color-mix(in srgb, ${trimmed} ${normalized}, transparent)` };
  }
  const hex = /^#([\da-f]{4}|[\da-f]{8})$/i.exec(trimmed);
  if (hex) {
    const raw = hex[1]!;
    const max = raw.length === 4 ? 15 : 255;
    const digits = raw.length === 4 ? 1 : 2;
    const alpha = Math.round((parseOpacityPercent(normalized)! / 100) * max).toString(16).padStart(digits, "0");
    return { ok: true, value: `${trimmed.slice(0, -digits)}${alpha}` };
  }
  if (/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(trimmed)) {
    return normalized === "100%"
      ? { ok: true, value: trimmed }
      : { ok: true, value: `color-mix(in srgb, ${trimmed} ${normalized}, transparent)` };
  }
  if (/^(?:rgba?|hsla?)\(/i.test(trimmed)) {
    const next = replaceFunctionOpacity(trimmed, normalized);
    if (next) return { ok: true, value: next };
    if (isOpaqueRgbOrHslFunction(trimmed)) {
      return normalized === "100%"
        ? { ok: true, value: trimmed }
        : { ok: true, value: `color-mix(in srgb, ${trimmed} ${normalized}, transparent)` };
    }
    return { ok: false, reason: "unsupported" };
  }
  if (/^color-mix\(/i.test(trimmed)) {
    const next = replaceColorMixOpacity(trimmed, normalized);
    return next ? { ok: true, value: next } : { ok: false, reason: "unsupported" };
  }
  return { ok: false, reason: "unsupported" };
}

function tokenReferenceName(entry: TokenEntry): string | null {
  const name = entry.cssName ?? entry.name;
  return name.startsWith("--") ? name : null;
}

type RgbTuple = readonly [number, number, number];

function rgbTuple(value: string): RgbTuple | null {
  const trimmed = value.trim();
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(trimmed);
  if (hex) {
    const raw = hex[1]!;
    const expanded = raw.length === 3 ? raw.split("").map((part) => part + part).join("") : raw;
    return [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16)) as unknown as RgbTuple;
  }
  const match = /^rgba?\(([\s\S]*)\)$/i.exec(trimmed);
  if (!match) return null;
  const body = match[1]!;
  const commaParts = splitTopLevel(body, ",");
  if (commaParts.length > 1 && commaParts.length !== 3 && commaParts.length !== 4) return null;
  const channelParts = commaParts.length >= 3
    ? commaParts.slice(0, 3)
    : splitTopLevelWhitespace(body.slice(0, Math.max(0, topLevelSlashIndex(body) < 0 ? body.length : topLevelSlashIndex(body))));
  if (channelParts.length !== 3) return null;
  const channels = channelParts.map((part) => CSS_NUMBER.test(part.trim()) ? Number(part.trim()) : Number.NaN);
  if (channels.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 255)) return null;
  return channels.map((channel) => Math.round(channel)) as unknown as RgbTuple;
}

function sameRgb(left: RgbTuple | null, right: RgbTuple | null): boolean {
  return Boolean(left && right && left.every((channel, index) => channel === right[index]));
}

function replaceRgbChannels(value: string, oldValue: string, nextValue: string): string | null {
  const match = /^(rgba?)\(([\s\S]*)\)$/i.exec(value.trim());
  const oldRgb = rgbTuple(oldValue);
  const nextRgb = rgbTuple(nextValue);
  if (!match || !sameRgb(rgbTuple(value), oldRgb) || !nextRgb) return null;
  const body = match[2]!;
  const commaParts = splitTopLevel(body, ",");
  if (commaParts.length >= 3) {
    const alpha = commaParts.length === 4 ? `, ${commaParts[3]!.trim()}` : "";
    return `${match[1]}(${nextRgb.join(", ")}${alpha})`;
  }
  const slash = topLevelSlashIndex(body);
  const alpha = slash >= 0 ? ` / ${body.slice(slash + 1).trim()}` : "";
  return `${match[1]}(${nextRgb.join(" ")}${alpha})`;
}

function replaceColorMixItemColor(item: string, color: string): string {
  const parsed = parseColorMixItem(item);
  if (!parsed.percentage) return color;
  const parts = splitTopLevelWhitespace(item.trim());
  return MIX_PERCENTAGE_OR_TOKEN.test(parts[0]!)
    ? `${parsed.percentage} ${color}`
    : `${color} ${parsed.percentage}`;
}

function replaceColorMixColor(value: string, oldValue: string, nextColor: string): string | null {
  const open = value.indexOf("(");
  const close = value.lastIndexOf(")");
  if (open < 0 || close <= open) return null;
  const parts = splitTopLevel(value.slice(open + 1, close), ",");
  if (parts.length !== 3 || !/^\s*in\s+/i.test(parts[0]!)) return null;
  const items = parts.slice(1).map(parseColorMixItem);
  const colorIndexes = items.flatMap((item, index) => item.color.toLowerCase() === "transparent" ? [] : [index]);
  if (colorIndexes.length !== 1) return null;
  const colorIndex = colorIndexes[0]!;
  if (!sameRgb(rgbTuple(items[colorIndex]!.color), rgbTuple(oldValue)) && items[colorIndex]!.color.trim().toLowerCase() !== oldValue.trim().toLowerCase()) return null;
  const updated = [...parts];
  updated[colorIndex + 1] = replaceColorMixItemColor(parts[colorIndex + 1]!, nextColor);
  return `${value.slice(0, open + 1)}${updated.join(", ")}${value.slice(close)}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Replaces only the color token in a separable color expression. Keeping this
 * separate from a plain token swap preserves authored alpha modifiers, for
 * example Tailwind's `color-mix(... var(--color-red-500) 10%, transparent)`
 * keeps its `10%` when the color token changes.
 */
export function applyColorTokenReplacement(value: string, oldToken: TokenEntry, newToken: TokenEntry): ColorEditResult {
  const nextName = tokenReferenceName(newToken);
  if (nextName) {
    for (const oldName of [oldToken.cssName, oldToken.name].filter((name): name is string => Boolean(name))) {
      const reference = new RegExp(`var\\(\\s*${escapeRegExp(oldName)}(?=\\s*(?:,|\\)))`, "i");
      if (reference.test(value)) {
        return {
          ok: true,
          value: value.replace(
            new RegExp(`var\\(\\s*${escapeRegExp(oldName)}(?=\\s*(?:,|\\)))`, "gi"),
            `var(${nextName}`,
          ),
        };
      }
    }
  }

  const oldValue = oldToken.cssValue?.trim() || oldToken.value.trim();
  const nextValue = newToken.cssValue?.trim() || newToken.value.trim();
  if (!oldValue || !nextValue) return { ok: false, reason: "unsupported" };
  const replacement = nextName ? `var(${nextName})` : nextValue;
  if (value.trim().toLowerCase() === oldValue.toLowerCase()) return { ok: true, value: replacement };
  if (sameRgb(rgbTuple(value), rgbTuple(oldValue)) && !/[/,]/.test(value)) return { ok: true, value: replacement };
  const rgbReplacement = replaceRgbChannels(value, oldValue, nextValue);
  if (rgbReplacement) return { ok: true, value: rgbReplacement };
  const mixReplacement = replaceColorMixColor(value, oldValue, replacement);
  if (mixReplacement) return { ok: true, value: mixReplacement };
  return { ok: false, reason: "unsupported" };
}
