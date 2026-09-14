/// <reference types="vite/client" />

interface Window {
  __designTokens?: import("nudge-ui/vite").TokenEntry[];
  __designTokenCatalog?: import("nudge-ui/vite").TokenDefinition[];
  __designTokenDiagnostics?: import("nudge-ui/vite").TokenCatalogDiagnostic[];
}
declare module "virtual:design-tokens" {
  import type {
    TokenCatalogDiagnostic,
    TokenDefinition,
    TokenEntry,
  } from "nudge-ui/vite";

  export const tokenCatalog: TokenDefinition[];
  export const tokens: TokenEntry[];
  export const tokenDiagnostics: TokenCatalogDiagnostic[];
}
