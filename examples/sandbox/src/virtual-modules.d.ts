/**
 * Consumer contract for the Design Tool virtual modules in the sandbox app.
 * Types are re-exported from the canonical shared model (`@design-tool/css/
 * model`) instead of being duplicated inline, so the ambient declaration only
 * declares the module shape the Vite adapter serializes.
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
