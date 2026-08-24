import type { TokenDefinition, TokenEntry } from "../virtual/design-tokens.ts";

export interface TokenEntryDefaults {
  adapter?: TokenEntry["adapter"];
  origin?: TokenEntry["origin"];
}

/**
 * Projects one catalog definition onto its serialized token entry. Both the
 * Tailwind v4 catalog export and the vanilla-extract merge output serialize
 * definitions with this exact shape; the only variance is provenance
 * fallbacks, which callers supply as defaults.
 */
export function tokenEntryFromDefinition(
  definition: TokenDefinition,
  defaults: TokenEntryDefaults = {},
): TokenEntry {
  return {
    name: definition.name,
    cssName: definition.cssName,
    value: definition.declarations[0]?.value ?? "",
    source: definition.declarations[0]?.source ?? "",
    cssValue: definition.cssValue,
    adapter: definition.adapter ?? defaults.adapter,
    origin: definition.origin ?? defaults.origin,
    editable: definition.editable,
  };
}
