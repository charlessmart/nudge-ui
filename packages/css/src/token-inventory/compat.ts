/**
 * Temporary compatibility projections for the legacy flat parsing API.
 *
 * @deprecated Since S2-A. These exist only for callers that still import the
 * flat projection before S2-D removes them (the plugin's Tailwind v4
 * bookkeeping that used them was replaced by the inventory's authored/
 * transformed reconciliation in S2-C). They preserve the exact legacy behavior
 * — most importantly the silent empty catalog for malformed CSS.
 */
import type { TokenDefinition, TokenEntry } from "../model/index.ts";
import { parseStylesheetArtifact } from "./parseStylesheet.ts";

/**
 * @deprecated Temporary compatibility projection. Prefer feeding artifacts to
 * `createTokenInventory()`; removal tracked in S2-D.
 */
export function parseTokenCatalog(css: string, sourceId: string): TokenDefinition[] {
  const contribution = parseStylesheetArtifact({
    buildTool: "vite",
    id: sourceId,
    stage: "authored",
    provenance: "project",
    content: css,
  });
  // Legacy callers treat malformed CSS as an empty catalog, not a diagnostic.
  if (contribution.diagnostics.length > 0) return [];
  return contribution.definitions.map((definition) => ({
    ...definition,
    declarations: definition.declarations.map(({ id: _id, order: _localOrder, ...rest }) => rest),
  }));
}

/**
 * @deprecated Temporary compatibility projection. Prefer the inventory
 * snapshot's `tokens`; removal tracked in S2-D.
 */
export function parseTokens(css: string, sourceId: string): TokenEntry[] {
  return parseTokenCatalog(css, sourceId).map((token) => ({
    name: token.cssName,
    value: token.declarations[0]?.value ?? "",
    source: token.declarations[0]?.source ?? sourceId,
  }));
}
