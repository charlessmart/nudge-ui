/// <reference types="vite/client" />

interface Window {
  __compatRerender?: () => void;
  __designTokens?: import("nudge-ui/vite/tokens").TokenEntry[];
  __designTokenCatalog?: import("nudge-ui/vite/tokens").TokenDefinition[];
  __designTokenDiagnostics?: import("nudge-ui/vite/tokens").TokenCatalogDiagnostic[];
}

declare module "virtual:design-tokens" {
  import type {
    TokenCatalogDiagnostic,
    TokenDefinition,
    TokenEntry,
  } from "nudge-ui/vite/tokens";

  export const tokenCatalog: TokenDefinition[];
  export const tokens: TokenEntry[];
  export const tokenDiagnostics: TokenCatalogDiagnostic[];
}
