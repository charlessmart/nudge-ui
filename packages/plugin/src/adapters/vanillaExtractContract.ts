import type { TokenDeclaration, TokenDefinition, TokenEntry } from "../virtual/design-tokens.ts";
import type { TokenContribution } from "@design-tool/css/token-inventory";
import type { ThemeContract } from "./vanillaExtract.ts";

/** Token transport view accepted from immutable inventory snapshots. */
export interface CatalogTokenDefinition extends Omit<TokenDefinition, "declarations"> {
  readonly declarations: readonly TokenDeclaration[];
}

export interface MaterializeVanillaExtractContractOptions {
  prefix?: string;
  source: string;
  origin?: TokenEntry["origin"];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Materialises a compiled vanilla-extract contract without guessing its hash format. */
export function materializeVanillaExtractContract(
  contract: ThemeContract,
  options: MaterializeVanillaExtractContractOptions,
): TokenEntry[] {
  const entries: TokenEntry[] = [];
  const prefix = options.prefix ?? "theme";

  function walk(value: unknown, path: string[]): void {
    if (typeof value === "string") {
      const cssName = /^var\(\s*(--[\w-]+)(?:\s*,[\s\S]*)?\)$/.exec(value.trim())?.[1];
      if (!cssName) return;
      entries.push({
        name: path.join("."),
        cssName,
        value,
        source: options.source,
        adapter: "vanilla-extract",
        origin: options.origin ?? "package",
        editable: false,
      });
      return;
    }
    if (!isRecord(value)) return;
    for (const [key, child] of Object.entries(value)) walk(child, [...path, key]);
  }

  walk(contract, [prefix]);
  return entries;
}

/**
 * Builds the normalized inventory contribution for a published theme contract.
 * The contract entries are contributed as a definition-level enrichment: the
 * inventory merges them by cssName against the aggregated stylesheet
 * definitions with the exact `enrichVanillaExtractCatalog` semantics (name /
 * adapter enrichment, CSS-derived origin/editability preserved when present,
 * unmatched entries ignored). Id-keyed and replaceable so a refreshed contract
 * replaces the prior contribution without duplicates.
 */
export function materializeVanillaExtractContribution(
  contract: ThemeContract,
  options: MaterializeVanillaExtractContractOptions,
): TokenContribution {
  const entries = materializeVanillaExtractContract(contract, options);
  return {
    id: "vanilla-extract-contract",
    order: 1,
    definitions: entries.map((entry) => ({
      cssName: entry.cssName ?? entry.name,
      name: entry.name,
      adapter: entry.adapter,
      origin: entry.origin,
      editable: entry.editable,
      // The contract provides identity, not a declaration: the CSS catalog
      // keeps value, source, context, and editability authority.
      declarations: [],
    })),
  };
}

/**
 * Contract paths enrich declarations already discovered from active CSS. The
 * CSS catalog keeps value, source, context, origin, and editability authority.
 *
 * @deprecated Compatibility projection used by the pre-2.5 post-snapshot
 * enrichment. The plugin now feeds `materializeVanillaExtractContribution`
 * through the inventory contribution seam; this function remains for callers
 * of the legacy shape.
 */
export function enrichVanillaExtractCatalog(
  catalog: readonly CatalogTokenDefinition[],
  contractEntries: TokenEntry[],
): CatalogTokenDefinition[] {
  const contractByCssName = new Map(contractEntries
    .filter((entry): entry is TokenEntry & { cssName: string } => Boolean(entry.cssName))
    .map((entry) => [entry.cssName, entry]));

  return catalog.map((definition) => {
    const contract = contractByCssName.get(definition.cssName);
    if (!contract) return definition;
    return {
      ...definition,
      // Preserve CSS-derived origin/editability when those records exist. A
      // package contract must never turn a third-party declaration editable.
      name: contract.name,
      adapter: contract.adapter,
      origin: definition.origin ?? contract.origin,
      editable: definition.editable ?? contract.editable,
    };
  });
}
