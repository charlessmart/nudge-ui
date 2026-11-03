import { isDialectInternalProperty, stylingDialect } from "../../css/dialects/index.ts";
import type { TokenEntry } from "../../css/model/index.ts";
import type { TokenOrigin, TokenTable } from "../../css/model/index.ts";
import type {
  AliasAttribution,
  AliasInnerResult,
  Directionality,
  ValueSemanticsContext,
} from "../../css/value-semantics/index.ts";

const EMPTY_LOCAL_ALIASES: ReadonlyMap<string, string> = new Map();

export function inspectorTokenOrigin(entry: TokenEntry | undefined): TokenOrigin {
  if (!entry) return "runtime";
  if (entry.origin) return entry.origin;
  return stylingDialect(entry.adapter)?.tokenOrigin ?? "project";
}

function colorTuple(value: string): string | null {
  const trimmed = value.trim().toLowerCase().replace(/\s*\/\s*var\([^)]*\)/, "");
  const hex = /^#([\da-f]{3}|[\da-f]{6})$/.exec(trimmed);
  if (hex) {
    const raw = hex[1]!;
    const expanded = raw.length === 3 ? raw.split("").map((part) => part + part).join("") : raw;
    return [expanded.slice(0, 2), expanded.slice(2, 4), expanded.slice(4, 6)]
      .map((part) => Number.parseInt(part, 16))
      .join(",");
  }
  const rgb = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/.exec(trimmed);
  return rgb ? [rgb[1], rgb[2], rgb[3]].map((part) => String(Math.round(Number(part)))).join(",") : null;
}

const literalColorIndexes = new WeakMap<TokenTable, Map<string, TokenEntry>>();

/** First literal dialect token per color tuple: a literal has no var() to name it, so its value is its identity. */
function literalColorIndex(tokenTable: TokenTable): Map<string, TokenEntry> {
  let index = literalColorIndexes.get(tokenTable);
  if (index) return index;
  index = new Map();
  for (const entry of Object.values(tokenTable)) {
    if (stylingDialect(entry.adapter)?.literalTokens !== true) continue;
    const tuple = colorTuple(entry.value);
    if (tuple && !index.has(tuple)) index.set(tuple, entry);
  }
  literalColorIndexes.set(tokenTable, index);
  return index;
}

function directLiteralColor(value: string, tokenTable: TokenTable): TokenEntry | undefined {
  const tuple = colorTuple(value);
  if (!tuple) return undefined;
  return literalColorIndex(tokenTable).get(tuple);
}

/** A dialect's plumbing variable is never itself a token; it names the token it forwards, if any. */
function dialectAliasPolicy(ref: string, inner: AliasInnerResult): AliasAttribution {
  if (!isDialectInternalProperty(ref)) {
    return {
      known: true,
      tokenName: ref,
      resolvedValue: inner.resolvedValue,
      leafTokenName: inner.leafTokenName ?? ref,
      cycle: inner.cycle,
    };
  }
  return inner.tokenName
    ? {
      known: true,
      tokenName: inner.tokenName,
      resolvedValue: inner.resolvedValue,
      leafTokenName: inner.leafTokenName ?? null,
      cycle: inner.cycle,
    }
    : {
      known: false,
      tokenName: null,
      resolvedValue: `var(${ref})`,
      leafTokenName: null,
      cycle: inner.cycle,
    };
}

export function createInspectorValueContext(
  tokenTable: TokenTable,
  localAliases: ReadonlyMap<string, string> = EMPTY_LOCAL_ALIASES,
  directionality?: Directionality,
): ValueSemanticsContext {
  return {
    tokenContext: {
      table: tokenTable,
      localAliases,
      resolveDirectToken: (value) => directLiteralColor(value, tokenTable),
      resolveOrigin: inspectorTokenOrigin,
      resolveAlias: dialectAliasPolicy,
    },
    ...(directionality ? { directionality } : {}),
  };
}
