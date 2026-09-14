// The deprecated `./bootstrap` compatibility entry still consumes the shared
// Vite virtual modules and inspector stylesheet declarations.
/// <reference path="../../inspector/src/vite-env.d.ts" />
/// <reference path="../../inspector/src/virtual-modules.d.ts" />
/// <reference path="../../inspector/src/ui/css.d.ts" />

declare module "*.css?inline" {
  const css: string;
  export default css;
}

declare module "virtual:nudge-ui-astro-context" {
  /** Vite-resolved project root; empty when unavailable. */
  export const projectRoot: string;
}
