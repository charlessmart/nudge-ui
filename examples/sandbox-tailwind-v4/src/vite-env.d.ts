/// <reference types="vite/client" />

interface Window {
  __designTokens?: import("@design-tool/css/model").TokenEntry[];
  __designTokenCatalog?: import("@design-tool/css/model").TokenDefinition[];
  __designTokenDiagnostics?: import("@design-tool/css/model").TokenCatalogDiagnostic[];
}
declare module "virtual:design-tokens" {
  import type {
    TokenCatalogDiagnostic,
    TokenDefinition,
    TokenEntry,
  } from "@design-tool/css/model";

  export const tokenCatalog: TokenDefinition[];
  export const tokens: TokenEntry[];
  export const tokenDiagnostics: TokenCatalogDiagnostic[];
}

