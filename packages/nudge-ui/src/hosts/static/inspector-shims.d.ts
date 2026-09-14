/**
 * The standalone package typechecks the shared inspector source directly
 * because the monorepo does not publish a compiled inspector declaration
 * package. These declarations describe the Vite-only source conveniences
 * that esbuild replaces or erases from the browser artifact.
 */
/// <reference path="../../inspector/src/vite-env.d.ts" />
/// <reference path="../../inspector/src/virtual-modules.d.ts" />
/// <reference path="../../inspector/src/ui/css.d.ts" />

declare module "*.css?inline" {
  const css: string;
  export default css;
}

declare module "virtual:design-tokens" {
  import type {
    TokenCatalogDiagnostic,
    TokenContext,
    TokenContextWrapper,
    TokenContextWrapperKind,
    TokenDeclaration,
    TokenDefinition,
    TokenEntry,
  } from "@nudge-ui/css/model";
  export type {
    TokenCatalogDiagnostic,
    TokenContext,
    TokenContextWrapper,
    TokenContextWrapperKind,
    TokenDeclaration,
    TokenDefinition,
    TokenEntry,
  } from "@nudge-ui/css/model";
  export const tokens: import("@nudge-ui/css/model").TokenEntry[];
  export const tokenCatalog: import("@nudge-ui/css/model").TokenDefinition[];
  export const tokenDiagnostics: import("@nudge-ui/css/model").TokenCatalogDiagnostic[];
  export const tokenGeneration: string;
  export const nudgeUiProjectId: string;
  export default tokens;
}

declare module "virtual:nudge-ui-components" {
  import type { ComponentContract } from "../../inspector/src/componentSemantics/types.ts";
  export const componentContracts: ComponentContract[];
  export default componentContracts;
}

interface ImportMetaEnv {
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
