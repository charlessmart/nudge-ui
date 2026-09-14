import type { TokenEntry } from "../model/index.ts";

/**
 * vanilla-extract generates the custom-property names, so the contract is the
 * only place the authored path (`theme.color.brand`) survives. Reading it is
 * how a host recovers names the emitted CSS cannot supply.
 */

/** A compiled contract: nested objects whose leaves are `var()` references. */
export type ThemeContract = Record<string, unknown>;

// Anchored: `var(--border) solid` is a composed style, not a token identity.
const CONTRACT_REFERENCE = /^var\(\s*(--[\w-]+)(?:\s*,[\s\S]*)?\)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface ReadThemeContractOptions {
  /** Prefix for generated token paths. Defaults to `theme`. */
  readonly prefix?: string;
  /** Source label recorded on every entry. */
  readonly source: string;
  readonly origin: TokenEntry["origin"];
  readonly editable: boolean;
  /** Omit when the host did not observe the emitted CSS; entries then keep their `var()` reference. */
  readonly cssValues?: Readonly<Record<string, string>>;
}

/** Flattens a contract into token entries keyed by their authored path. */
export function readThemeContract(
  contract: unknown,
  options: ReadThemeContractOptions,
): TokenEntry[] {
  const entries: TokenEntry[] = [];

  const walk = (value: unknown, path: string[]): void => {
    if (typeof value === "string") {
      const cssName = CONTRACT_REFERENCE.exec(value.trim())?.[1];
      if (cssName === undefined) return;
      entries.push({
        name: path.join("."),
        cssName,
        value: options.cssValues?.[cssName] ?? value,
        source: options.source,
        adapter: "vanilla-extract",
        origin: options.origin,
        editable: options.editable,
      });
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) walk(child, [...path, key]);
  };

  walk(contract, [options.prefix ?? "theme"]);
  return entries;
}
