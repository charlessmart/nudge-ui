/**
 * Temporary compatibility projections for the legacy flat parsing API.
 *
 * @deprecated Since S2-A. These exist only while the Vite plugin still calls
 * `parseTokenCatalog`/`parseTokens` (see `packages/plugin/src/tokens/
 * parseTokens.ts`, which is now a thin re-export). They preserve the exact
 * legacy behavior — most importantly the silent empty catalog for malformed
 * CSS — so the plugin can adopt the inventory without a behavior change.
 * Remove both in S2-B once the Vite adapter feeds artifacts to the inventory
 * engine instead of calling the parser directly.
 */
import type { TokenDefinition, TokenEntry } from "../model/index.ts";
import { parseStylesheetArtifact } from "./parseStylesheet.ts";

/**
 * @deprecated Temporary compatibility projection. Prefer feeding artifacts to
 * `createTokenInventory()`; removal tracked in S2-B.
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
 * snapshot's `tokens`; removal tracked in S2-B.
 */
export function parseTokens(css: string, sourceId: string): TokenEntry[] {
  return parseTokenCatalog(css, sourceId).map((token) => ({
    name: token.cssName,
    value: token.declarations[0]?.value ?? "",
    source: token.declarations[0]?.source ?? sourceId,
  }));
}
