/**
 * Token-reference, alias, and modifier interpretation (plan slice 3.2).
 *
 * This is the deep value-semantics Module for token attribution: it turns one
 * CSSOM-authored value into the structured token facts an inspector needs —
 * the primary field token, every referenced token with its origin, the leaf
 * token behind chained aliases, explicit modifiers (fallbacks and alpha), and
 * a `cycle` diagnostic when alias traversal loops.
 *
 * Interface invariants:
 * - the Module never touches the DOM or CSSOM; the token table, local
 *   aliases, color/opacity reading, direct-literal attribution, and alias
 *   attribution are all explicit inputs (`TokenInterpretationContext`);
 * - the primary token, all referenced tokens, and implementation aliases stay
 *   distinct;
 * - alias cycles terminate and surface a `cycle` diagnostic;
 * - arbitrary input does not throw through `interpretTokenValue`;
 * - framework-specific policy — Tailwind `--tw-*` aliases, adapter-derived
 *   token origins, direct Tailwind v3 color attribution — is injected by the
 *   integration, never encoded here.
 */
import type {
  ColorOpacity,
  TokenEntry,
  TokenOrigin,
  TokenReference,
  TokenTable,
  ValueModifier,
} from "../model/index.ts";
import {
  interpretColorOpacity,
  type ColorComponentResolution,
} from "./colorSemantics.ts";
export { extractVarCalls } from "./cssSyntax.ts";
import { extractVarCalls } from "./cssSyntax.ts";

/** The structured token interpretation of one authored CSSOM value. */
export interface TokenValueInterpretation {
  /** The primary field token, or null when no non-alpha token is primary. */
  tokenName: string | null;
  /** The authored value with the primary reference substituted by its leaf. */
  resolvedValue: string;
  /** Every referenced token (primary, fallback, opacity), deduped, with origin. */
  tokens: TokenReference[];
  /** Normalized opacity when the value carries an alpha component. */
  opacity?: ColorOpacity;
  /** Explicit fallback and alpha modifiers derived from the authored value. */
  modifiers: ValueModifier[];
  /** The token reached after traversing chained aliases from `tokenName`. */
  leafTokenName: string | null;
  /** The alias reference that repeated during traversal, when a cycle exists. */
  cycle?: string;
}

/** The interpretation of a token's own value after alias traversal. */
export interface AliasInnerResult {
  tokenName: string | null;
  resolvedValue: string;
  leafTokenName: string | null;
  cycle?: string;
}

/**
 * How a local alias reference is attributed after its value is resolved.
 * The neutral default authors the alias name itself; the Tailwind `--tw-*`
 * policy (attributing to the catalog token an implementation alias points at)
 * is supplied by the integration.
 */
export interface AliasAttribution {
  known: boolean;
  tokenName: string | null;
  resolvedValue: string;
  leafTokenName: string | null;
  cycle?: string;
}

/** Facts the token interpretation needs that are not part of the authored text. */
export interface TokenInterpretationContext {
  /** Resolved token table (custom-property name → entry). */
  table: TokenTable;
  /** Local aliases collected from the selected element's cascade. */
  localAliases?: ReadonlyMap<string, string>;
  /**
   * Direct literal attribution: a token entry matched to the authored value
   * before var() interpretation (integration policy, e.g. Tailwind v3 config
   * tokens). Absent when no direct attribution applies.
   */
  resolveDirectToken?: (value: string) => TokenEntry | undefined;
  /** Token-origin derivation. Default: `entry.origin ?? "project"` (undefined → "runtime"). */
  resolveOrigin?: (entry: TokenEntry | undefined) => TokenOrigin;
  /** Local-alias attribution policy. Default attributes the alias reference itself. */
  resolveAlias?: (ref: string, inner: AliasInnerResult) => AliasAttribution;
}

const EMPTY_LOCAL_ALIASES: ReadonlyMap<string, string> = new Map();

/**
 * Neutral token-origin derivation. Adapter-name heuristics ("tailwind-v3"
 * → "framework", "vanilla-extract" → "project") remain integration policy.
 */
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

/**
 * Balanced `var()` scanning lives in `cssSyntax.ts` (shared internal seam) and
 * is re-exported here to keep the public token-interpretation API stable.
 */

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

/**
 * Interprets the token references, aliases, and modifiers of one authored
 * CSSOM value against explicit token knowledge. Returns the primary token,
 * every referenced token, the leaf token, modifiers, and a cycle diagnostic.
 */
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

  const opacity = interpretColorOpacity(authored, {
    tokenTable: table,
    localAliases,
    resolveTokenReference: (value) => resolveComponentReference(value, ctx),
  });
  const modifiers: ValueModifier[] = calls.flatMap((call) => call.fallback ? [{ kind: "fallback" as const, value: call.fallback }] : []);
  if (opacity) modifiers.push({ kind: "alpha", value: opacity.value });

  const inner = resolveTokenValueInner(authored, table, new Set(), localAliases, ctx);
  // An alpha variable is still a token reference, but it is not the color
  // token represented by the field. For example, in
  // `rgb(37 99 235 / var(--opacity-muted))`, the color is literal and only
  // the opacity is token-backed. Keep that distinction in `tokenName` so the
  // UI can render a base color chip only when one actually exists.
  const alphaTokenName = opacity?.tokenName;
  const baseKnown = firstKnown && firstKnown.tokenName !== alphaTokenName ? firstKnown : null;
  const baseInner = inner.tokenName && inner.tokenName !== alphaTokenName ? inner : null;
  const primary = baseKnown ?? baseInner;
  return {
    tokenName: primary?.tokenName ?? (alphaTokenName ? null : firstKnown?.tokenName ?? inner.tokenName),
    resolvedValue: primary?.resolvedValue ?? (alphaTokenName ? authored : inner.resolvedValue),
    tokens: references,
    opacity,
    modifiers,
    leafTokenName: primary?.leafTokenName ?? primary?.tokenName ?? null,
    cycle: primary?.cycle,
  };
}

/**
 * Resolves a `var()` component of a color expression (for example an opacity
 * token) through the same interpretation context as the authored value. This
 * is what the color Module's `interpretColorOpacity` uses to attribute
 * token-backed alpha components, keeping alias and framework attribution in
 * the token interpretation.
 */
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
