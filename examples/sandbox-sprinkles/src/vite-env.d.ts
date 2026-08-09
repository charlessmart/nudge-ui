/// <reference types="vite/client" />

interface Window {
  __compatRerender?: () => void;
}

declare module "virtual:design-tokens" {
  export const tokenCatalog: Array<Record<string, unknown>>;
  export const tokens: Array<Record<string, unknown>>;
  export const tokenDiagnostics: Array<Record<string, unknown>>;
}
