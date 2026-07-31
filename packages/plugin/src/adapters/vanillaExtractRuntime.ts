import type { TokenDefinition, TokenEntry } from "../virtual/design-tokens.ts";
import type { ThemeContract } from "./vanillaExtract.ts";

export interface MaterializeVanillaExtractOptions {
  prefix?: string;
  source?: string;
}

export interface MaterializedTokenCatalog {
  tokenCatalog: TokenDefinition[];
  tokens: TokenEntry[];
}

const CSS_VAR = /^var\(\s*(--[\w-]+)(?:\s*,[\s\S]*)?\)$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Converts vanilla-extract's compiled contract export into semantic entries. */
export function materializeVanillaExtractContract(
  contract: ThemeContract,
  options: MaterializeVanillaExtractOptions = {},
): TokenEntry[] {
  const entries: TokenEntry[] = [];
  const prefix = options.prefix ?? "theme";
  const source = options.source ?? "theme-contract.css.ts";

  function walk(value: unknown, path: string[]): void {
    if (typeof value === "string") {
      const cssName = CSS_VAR.exec(value.trim())?.[1];
      if (!cssName) return;
      entries.push({
        name: path.join("."),
        cssName,
        value,
        source,
        adapter: "vanilla-extract",
        origin: "project",
        editable: true,
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
 * Overlays semantic contract names onto CSS declarations captured from the
 * real compiler. CSS names remain the identity key; no generated hash is
 * inferred or hardcoded.
 */
export function mergeVanillaExtractContract(
  baseCatalog: TokenDefinition[],
  contractEntries: TokenEntry[],
): MaterializedTokenCatalog {
  const catalog = baseCatalog.map((definition) => ({
    ...definition,
    declarations: definition.declarations.map((declaration) => ({ ...declaration })),
  }));
  const indexByCssName = new Map(catalog.map((definition, index) => [definition.cssName, index]));

  for (const entry of contractEntries) {
    const cssName = entry.cssName ?? entry.name;
    const index = indexByCssName.get(cssName);
    if (index !== undefined) {
      catalog[index] = {
        ...catalog[index]!,
        name: entry.name,
        adapter: entry.adapter,
        origin: entry.origin,
        editable: entry.editable,
      };
      continue;
    }
    indexByCssName.set(cssName, catalog.length);
    catalog.push({
      cssName,
      name: entry.name,
      adapter: entry.adapter,
      origin: entry.origin,
      editable: entry.editable,
      // The contract provides identity, not a declaration. Runtime CSSOM
      // hydration supplies the compiler-accepted value and selector context.
      declarations: [],
    });
  }

  return {
    tokenCatalog: catalog,
    tokens: catalog.map((definition) => ({
      name: definition.name,
      cssName: definition.cssName,
      value: definition.declarations[0]?.value ?? "",
      source: definition.declarations[0]?.source ?? "",
      cssValue: definition.cssValue,
      adapter: definition.adapter,
      origin: definition.origin,
      editable: definition.editable,
    })),
  };
}
