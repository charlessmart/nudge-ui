/**
 * Thin compatibility shim over the token inventory parser.
 *
 * @deprecated The canonical parsing now lives in `@design-tool/css/
 * token-inventory`. This module only re-exports the temporary compatibility
 * projections so the plugin's `cacheTokensForFile` and public re-exports keep
 * working with identical behavior until S2-B replaces the `cssTokens` map with
 * the inventory engine. Do not add new logic here.
 */
export { parseTokenCatalog, parseTokens } from "@design-tool/css/token-inventory";
