/// <reference types="vite/client" />

interface Window {
  __designTokens?: import("virtual:design-tokens").TokenEntry[];
  __designTokenCatalog?: import("virtual:design-tokens").TokenDefinition[];
  __designTokenDiagnostics?: import("virtual:design-tokens").TokenCatalogDiagnostic[];
  __nudgeUiRerender?: () => void;
}
