import type { TokenEntry } from "../model/index.ts";

/**
 * vanilla-extract theme contracts.
 *
 * A contract is a plain object whose leaves are `var(--name)` references. The
 * compiler generates those custom-property names, so the contract is the only
 * place the authored, semantic path (`theme.color.brand`) survives. Reading it
 * is how a host recovers names the emitted CSS cannot supply on its own.
 */

/** A compiled contract: nested objects whose leaves are `var()` references. */
export type ThemeContract = Record<string, unknown>;

/**
 * A contract leaf: a whole `var()` reference, optionally with a fallback.
 *
 * Anchored deliberately. A value that merely *contains* a reference, such as
 * `var(--border) solid`, is a composed style rather than a token identity, and
 * indexing it as one would attach a semantic name to the wrong thing.
 */
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
  /**
   * Compiled values by custom-property name, when the host observed the
   * emitted CSS. Without it an entry keeps its `var()` reference, which states
   * honestly that no value was observed rather than inventing one.
   */
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
