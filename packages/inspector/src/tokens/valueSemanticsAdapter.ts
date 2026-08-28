import type { TokenEntry } from "virtual:design-tokens";
import type { TokenOrigin, TokenTable } from "@nudge-ui/css/model";
import type {
  AliasAttribution,
  AliasInnerResult,
  Directionality,
  ValueSemanticsContext,
} from "@nudge-ui/css/value-semantics";

const EMPTY_LOCAL_ALIASES: ReadonlyMap<string, string> = new Map();

export function inspectorTokenOrigin(entry: TokenEntry | undefined): TokenOrigin {
  if (!entry) return "runtime";
  if (entry.origin) return entry.origin;
  if (entry.adapter === "tailwind-v3" || entry.adapter === "tailwind-v4") return "framework";
  return "project";
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

function directFrameworkColor(value: string, tokenTable: TokenTable): TokenEntry | undefined {
  const tuple = colorTuple(value);
  if (!tuple) return undefined;
  return Object.values(tokenTable).find((entry) =>
    entry.adapter === "tailwind-v3" && colorTuple(entry.value) === tuple);
}

function twLocalAliasPolicy(ref: string, inner: AliasInnerResult): AliasAttribution {
  if (!ref.startsWith("--tw-")) {
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

/** Inspector Adapter for framework-specific token attribution facts. */
export function createInspectorValueContext(
  tokenTable: TokenTable,
  localAliases: ReadonlyMap<string, string> = EMPTY_LOCAL_ALIASES,
  directionality?: Directionality,
): ValueSemanticsContext {
  return {
    tokenContext: {
      table: tokenTable,
      localAliases,
      resolveDirectToken: (value) => directFrameworkColor(value, tokenTable),
      resolveOrigin: inspectorTokenOrigin,
      resolveAlias: twLocalAliasPolicy,
    },
    ...(directionality ? { directionality } : {}),
  };
}
