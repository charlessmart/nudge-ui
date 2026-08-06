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
  export const designToolProjectId: string;
  export default tokens;
}

declare module "virtual:design-tool-components" {
  import type { ComponentContract } from "./componentSemantics/types.ts";
  export const componentContracts: ComponentContract[];
  export default componentContracts;
}
