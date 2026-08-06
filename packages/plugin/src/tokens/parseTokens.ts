/**
 * Thin compatibility shim over the token inventory parser.
 *
 * @deprecated The canonical parsing now lives in `@design-tool/css/
 * token-inventory`. This module only re-exports the temporary compatibility
 * projections so the plugin's Tailwind v4 provenance bookkeeping keeps working
 * with identical behavior until S2-C replaces it with the styling Adapter /
 * inventory contribution seam. Vite 5 externalizes bare dependencies while
 * bundling its TypeScript config, so this workspace-only shim reaches the
 * public source entry by relative path; otherwise Node is asked to execute the
 * package's uncompiled `.ts` export. Do not add new logic here.
 */
export { parseTokenCatalog, parseTokens } from "../../../css/src/token-inventory/index.ts";
