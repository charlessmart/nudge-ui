/** Compile-time contract for the Astro integration's project-context module. */
declare module "virtual:nudge-ui-astro-context" {
  /** Vite-resolved project root; empty when unavailable. */
  export const projectRoot: string;
}
