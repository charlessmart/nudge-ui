import type {
  ColorOpacity,
  ColorValueFacts,
  TokenEntry,
  TokenOrigin,
  TokenReference,
  TokenTable,
  ValueModifier,
} from "../model/index.ts";
import {
  interpretColorValue,
  type ColorComponentResolution,
} from "./colorSemantics.ts";
export { extractVarCalls } from "./cssSyntax.ts";
import { extractVarCalls } from "./cssSyntax.ts";

export interface TokenValueInterpretation {
  /** The primary field token, or null when no non-alpha token is primary. */
  tokenName: string | null;
  /** The authored value with the primary reference substituted by its leaf. */
  resolvedValue: string;
  /** Every referenced token (primary, fallback, opacity), deduped, with origin. */
  tokens: TokenReference[];
  opacity?: ColorOpacity;
  /** Color-shape facts projected for the UI. */
  color: ColorValueFacts;
  modifiers: ValueModifier[];
  /** The token reached after traversing chained aliases from `tokenName`. */
  leafTokenName: string | null;
  /** The alias reference that repeated, when a cycle exists. */
  cycle?: string;
}

export interface AliasInnerResult {
  tokenName: string | null;
  resolvedValue: string;
  leafTokenName: string | null;
  cycle?: string;
}

/** Attribution policy for a local alias reference; framework-specific behaviour is injected. */
export interface AliasAttribution {
  known: boolean;
  tokenName: string | null;
  resolvedValue: string;
  leafTokenName: string | null;
  cycle?: string;
}

export interface TokenInterpretationContext {
  /** Resolved token table (custom-property name → entry). */
  table: TokenTable;
  /** Local aliases collected from the selected element's cascade. */
  localAliases?: ReadonlyMap<string, string>;
  /** Direct literal attribution before var() interpretation (e.g. Tailwind v3 config tokens). */
  resolveDirectToken?: (value: string) => TokenEntry | undefined;
  /** Defaults to `entry.origin ?? "project"`. */
  resolveOrigin?: (entry: TokenEntry | undefined) => TokenOrigin;
  /** Default attributes the alias reference itself. */
  resolveAlias?: (ref: string, inner: AliasInnerResult) => AliasAttribution;
}

const EMPTY_LOCAL_ALIASES: ReadonlyMap<string, string> = new Map();

/** Neutral derivation; adapter-name heuristics stay integration policy. */
export function defaultTokenOrigin(entry: TokenEntry | undefined): TokenOrigin {
  if (!entry) return "runtime";
  return entry.origin ?? "project";
}

function defaultAliasAttribution(ref: string, inner: AliasInnerResult): AliasAttribution {
  return {
    known: true,
    tokenName: ref,
    resolvedValue: inner.resolvedValue,
    leafTokenName: inner.leafTokenName ?? ref,
    cycle: inner.cycle,
  };
}

/** Re-exported to keep the public token-interpretation API stable. */

interface RefResult {
  known: boolean;
  tokenName: string | null;
  resolvedValue: string;
  leafTokenName: string | null;
  cycle?: string;
}

function resolveRef(
  ref: string,
  table: TokenTable,
  visited: Set<string>,
  localAliases: ReadonlyMap<string, string>,
  ctx: TokenInterpretationContext,
): RefResult {
  if (visited.has(ref)) {
    const entry = table[ref];
    return {
      known: entry !== undefined,
      tokenName: entry ? entry.name : null,
      resolvedValue: entry ? entry.value : `var(${ref})`,
      leafTokenName: entry ? entry.name : null,
      cycle: ref,
    };
  }
  const entry = table[ref];
  if (entry) {
    const nextVisited = new Set(visited);
    nextVisited.add(ref);
    const inner = resolveTokenValueInner(entry.value, table, nextVisited, localAliases, ctx);
    return { known: true, tokenName: entry.name, resolvedValue: inner.resolvedValue, leafTokenName: inner.leafTokenName ?? entry.name, cycle: inner.cycle };
  }

  const localValue = localAliases.get(ref);
  if (localValue === undefined) {
    return { known: false, tokenName: null, resolvedValue: `var(${ref})`, leafTokenName: null };
  }

  const nextVisited = new Set(visited);
  nextVisited.add(ref);
  const inner = resolveTokenValueInner(localValue, table, nextVisited, localAliases, ctx);
  return (ctx.resolveAlias ?? defaultAliasAttribution)(ref, inner);
}

function resolveTokenValueInner(
  value: string,
  table: TokenTable,
  visited: Set<string>,
  localAliases: ReadonlyMap<string, string>,
  ctx: TokenInterpretationContext,
): AliasInnerResult {
  const trimmed = value.trim();
  const refs = extractVarCalls(trimmed).map((call) => call.name);
  if (refs.length === 0) return { tokenName: null, resolvedValue: trimmed, leafTokenName: null };
  for (const ref of refs) {
    const res = resolveRef(ref, table, visited, localAliases, ctx);
    if (res.known) return { tokenName: res.tokenName, resolvedValue: res.resolvedValue, leafTokenName: res.leafTokenName, cycle: res.cycle };
  }
  return { tokenName: null, resolvedValue: trimmed, leafTokenName: null };
}

/** Interprets token references, aliases, and modifiers against explicit token knowledge. */
export function interpretTokenValue(
  value: string,
  ctx: TokenInterpretationContext,
): TokenValueInterpretation {
  const authored = value.trim();
  const table = ctx.table;
  const localAliases = ctx.localAliases ?? EMPTY_LOCAL_ALIASES;
  const resolveOrigin = ctx.resolveOrigin ?? defaultTokenOrigin;
  const calls = extractVarCalls(authored);
  const references: TokenReference[] = [];
  let firstKnown: { tokenName: string; leafTokenName: string | null; resolvedValue: string; cycle?: string } | null = null;

  const directToken = ctx.resolveDirectToken?.(authored);
  if (directToken) {
    firstKnown = { tokenName: directToken.name, leafTokenName: directToken.name, resolvedValue: directToken.value };
    references.push({ name: directToken.name, origin: resolveOrigin(directToken) });
  }

  for (const call of calls) {
    const result = resolveRef(call.name, table, new Set(), localAliases, ctx);
    if (result.known) {
      if (!references.some((token) => token.name === result.tokenName)) {
        references.push({
          name: result.tokenName ?? call.name,
          origin: resolveOrigin(table[call.name] ?? table[result.tokenName ?? ""]),
        });
      }
      if (!firstKnown) {
        firstKnown = {
          tokenName: result.tokenName ?? call.name,
          leafTokenName: result.leafTokenName,
          resolvedValue: result.resolvedValue,
          cycle: result.cycle,
        };
      }
    }
    if (call.fallback) {
      const fallback = call.fallback.trim();
      if (fallback) {
        const fallbackResult = interpretTokenValue(fallback, ctx);
        references.push(...fallbackResult.tokens.filter((token) => !references.some((seen) => seen.name === token.name)));
        if (!firstKnown && fallbackResult.tokenName) {
          firstKnown = {
            tokenName: fallbackResult.tokenName,
            leafTokenName: fallbackResult.leafTokenName,
            resolvedValue: fallbackResult.resolvedValue,
            cycle: fallbackResult.cycle,
          };
        }
      }
    }
  }

  const colorContext = {
    tokenTable: table,
    localAliases,
    resolveTokenReference: (value: string) => resolveComponentReference(value, ctx),
  };
  const authoredColor = interpretColorValue(authored, colorContext);
  const opacity = authoredColor.opacity;
  const modifiers: ValueModifier[] = calls.flatMap((call) => call.fallback ? [{ kind: "fallback" as const, value: call.fallback }] : []);
  if (opacity) modifiers.push({ kind: "alpha", value: opacity.value });

  const inner = resolveTokenValueInner(authored, table, new Set(), localAliases, ctx);
  // An alpha variable is still a token reference, but it is not the field's
  // color token (`rgb(37 99 235 / var(--opacity-muted))` is literal color plus
  // token-backed alpha). Keeping that distinction lets the UI render a base
  // color chip only when one actually exists.
  const alphaTokenName = opacity?.tokenName;
  const baseKnown = firstKnown && firstKnown.tokenName !== alphaTokenName ? firstKnown : null;
  const baseInner = inner.tokenName && inner.tokenName !== alphaTokenName ? inner : null;
  const primary = baseKnown ?? baseInner;
  const resolvedColor = primary?.resolvedValue
    ? interpretColorValue(primary.resolvedValue, colorContext)
    : null;
  return {
    tokenName: primary?.tokenName ?? (alphaTokenName ? null : firstKnown?.tokenName ?? inner.tokenName),
    resolvedValue: primary?.resolvedValue ?? (alphaTokenName ? authored : inner.resolvedValue),
    tokens: references,
    opacity,
    color: {
      hasEmbeddedAlpha: authoredColor.facts.hasEmbeddedAlpha || Boolean(resolvedColor?.facts.hasEmbeddedAlpha),
      isExpression: authoredColor.facts.isExpression,
      opacityEditable: authoredColor.facts.opacityEditable && !resolvedColor?.facts.hasEmbeddedAlpha,
    },
    modifiers,
    leafTokenName: primary?.leafTokenName ?? primary?.tokenName ?? null,
    cycle: primary?.cycle,
  };
}

/** Resolves a `var()` component (e.g. an opacity token) through the same context as the authored value. */
function resolveComponentReference(
  value: string,
  ctx: TokenInterpretationContext,
): ColorComponentResolution | null {
  const calls = extractVarCalls(value);
  if (calls.length === 0) return null;
  const table = ctx.table;
  const localAliases = ctx.localAliases ?? EMPTY_LOCAL_ALIASES;
  const resolveOrigin = ctx.resolveOrigin ?? defaultTokenOrigin;
  const references: TokenReference[] = [];
  let firstKnown: { tokenName: string; resolvedValue: string } | null = null;
  for (const call of calls) {
    const result = resolveRef(call.name, table, new Set(), localAliases, ctx);
    if (result.known) {
      if (!references.some((token) => token.name === result.tokenName)) {
        references.push({
          name: result.tokenName ?? call.name,
          origin: resolveOrigin(table[call.name] ?? table[result.tokenName ?? ""]),
        });
      }
      if (!firstKnown) {
        firstKnown = { tokenName: result.tokenName ?? call.name, resolvedValue: result.resolvedValue };
      }
    }
    if (call.fallback) {
      const fallback = call.fallback.trim();
      if (fallback) {
        const fallbackResult = interpretTokenValue(fallback, ctx);
        references.push(...fallbackResult.tokens.filter((token) => !references.some((seen) => seen.name === token.name)));
        if (!firstKnown && fallbackResult.tokenName) {
          firstKnown = { tokenName: fallbackResult.tokenName, resolvedValue: fallbackResult.resolvedValue };
        }
      }
    }
  }
  return firstKnown ? { tokenName: firstKnown.tokenName, resolvedValue: firstKnown.resolvedValue, tokens: references } : null;
}
