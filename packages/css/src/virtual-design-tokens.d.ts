/** Canonical ambient transport contract published by the Vite Adapter. */
declare module "virtual:design-tokens" {
  export type {
    TokenCatalogDiagnostic,
    TokenContext,
    TokenContextWrapper,
    TokenContextWrapperKind,
    TokenDeclaration,
    TokenDefinition,
    TokenEntry,
  } from "@nudge-ui/css/model";
  export const tokens: TokenEntry[];
  export const tokenCatalog: TokenDefinition[];
  export const tokenDiagnostics: TokenCatalogDiagnostic[];
  export const tokenGeneration: string;
  export const nudgeUiProjectId: string;
}
