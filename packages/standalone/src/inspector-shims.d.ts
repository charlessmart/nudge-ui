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
  } from "@design-tool/css/model";
  export type {
    TokenCatalogDiagnostic,
    TokenContext,
    TokenContextWrapper,
    TokenContextWrapperKind,
    TokenDeclaration,
    TokenDefinition,
    TokenEntry,
  } from "@design-tool/css/model";
  export const tokens: import("@design-tool/css/model").TokenEntry[];
  export const tokenCatalog: import("@design-tool/css/model").TokenDefinition[];
  export const tokenDiagnostics: import("@design-tool/css/model").TokenCatalogDiagnostic[];
  export const tokenGeneration: string;
  export const designToolProjectId: string;
  export default tokens;
}

declare module "virtual:design-tool-components" {
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
