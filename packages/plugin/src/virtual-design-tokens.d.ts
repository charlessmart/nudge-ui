/**
 * Producer contract for the `virtual:design-tokens` module. Types are re-exported
 * from the canonical shared model (`@design-tool/css/model`); this file only
 * declares the module shape `load()` serializes. The inspector package keeps the
 * mirror consumer declaration in `src/virtual-modules.d.ts`.
 */
declare module "virtual:design-tokens" {
  export type {
    TokenCatalogDiagnostic,
    TokenContext,
    TokenContextWrapper,
    TokenContextWrapperKind,
    TokenDeclaration,
    TokenDefinition,
    TokenEntry,
  } from "@design-tool/css/model";
  export const tokens: TokenEntry[];
  export const tokenCatalog: TokenDefinition[];
  export const tokenDiagnostics: TokenCatalogDiagnostic[];
  export const tokenGeneration: string;
  export const designToolProjectId: string;
  export default tokens;
}
