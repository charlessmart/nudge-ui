/**
 * Consumer contract for the Design Tool virtual modules. Types are re-exported
 * from the canonical shared model (`@design-tool/css/model`); the plugin package
 * keeps the mirror producer declaration in `src/virtual-design-tokens.d.ts`.
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

declare module "virtual:design-tool-components" {
  import type { ComponentContract } from "./componentSemantics/types.ts";
  export const componentContracts: ComponentContract[];
  export default componentContracts;
}
