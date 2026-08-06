/**
 * Thin compatibility shim over the token inventory parser.
 *
 * @deprecated The canonical parsing now lives in `@design-tool/css/
 * token-inventory`. This module only re-exports the temporary compatibility
 * projections for legacy callers until S2-D removes them. The plugin's own
 * Tailwind v4 bookkeeping that used them was replaced by the inventory's
 * authored/transformed reconciliation (S2-C). Vite 5 externalizes bare
 * dependencies while bundling its TypeScript config, so this workspace-only
 * shim reaches the public source entry by relative path; otherwise Node is
 * asked to execute the package's uncompiled `.ts` export. Do not add logic here.
 */
export { parseTokenCatalog, parseTokens } from "../../../css/src/token-inventory/index.ts";
