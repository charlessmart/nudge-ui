/// <reference types="vite/client" />

declare module "virtual:nudge-ui-inspector" {
  // Side-effect-only module the plugin emits the inspector bootstrap for.
  export {};
}

/** The published nudge-ui version, injected by vite.config.ts. */
declare const __NUDGE_UI_VERSION__: string;
