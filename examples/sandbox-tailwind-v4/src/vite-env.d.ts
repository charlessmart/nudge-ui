/// <reference types="vite/client" />

interface Window {
  __designTokens?: import("@nudge-ui/css/model").TokenEntry[];
  __designTokenCatalog?: import("@nudge-ui/css/model").TokenDefinition[];
  __designTokenDiagnostics?: import("@nudge-ui/css/model").TokenCatalogDiagnostic[];
}
declare module "virtual:design-tokens" {
  import type {
    TokenCatalogDiagnostic,
    TokenDefinition,
    TokenEntry,
  } from "@nudge-ui/css/model";

  export const tokenCatalog: TokenDefinition[];
  export const tokens: TokenEntry[];
  export const tokenDiagnostics: TokenCatalogDiagnostic[];
}

