/**
 * The Astro package typechecks the shared inspector source directly (the
 * monorepo does not publish a compiled inspector declaration package), so it
 * mirrors the standalone package's shims: the Vite-only source conveniences
 * that the bundler replaces or erases, plus this host's own virtual context.
 */
/// <reference path="../../inspector/src/vite-env.d.ts" />
/// <reference path="../../inspector/src/virtual-modules.d.ts" />
/// <reference path="../../inspector/src/ui/css.d.ts" />

declare module "*.css?inline" {
  const css: string;
  export default css;
}

declare module "virtual:design-tool-astro-context" {
  /** Vite-resolved project root; empty when unavailable. */
  export const projectRoot: string;
}
