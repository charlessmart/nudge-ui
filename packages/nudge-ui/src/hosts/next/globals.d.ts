/**
 * Ambient declarations mirroring the inspector's own environment so tsc can
 * follow `@nudge-ui/inspector` sources from this package. The inspector's
 * declarations live in its source tree and only apply inside its own
 * program; this package compiles `mount.tsx` against those sources and needs
 * the same vocabulary.
 */

/** The dev-flag seam reads a bundler-defined flag; see inspector vite-env.d.ts. */
interface ImportMetaEnv {
  readonly DEV: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Canonical ambient transport contract published by the Vite Adapter. */
declare module "virtual:design-tokens" {
  export type {
    TokenCatalogDiagnostic,
    TokenContext,
    TokenContextWrapper,
    TokenContextWrapperKind,
    TokenDeclaration,
    TokenDefinition,
    TokenEntry,
  } from "@nudge-ui/css/model";
  export const tokens: TokenEntry[];
  export const tokenCatalog: TokenDefinition[];
  export const tokenDiagnostics: TokenCatalogDiagnostic[];
  export const tokenGeneration: string;
  export const nudgeUiProjectId: string;
  export default tokens;
}
