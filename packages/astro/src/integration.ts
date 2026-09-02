import type { AstroIntegration } from "astro";
import { nudgeUi, type NudgeUiOptions } from "@nudge-ui/plugin";
import { createProjectContextPlugin } from "./projectContext.ts";

export type { NudgeUiOptions };

/**
 * Options for `nudgeUiAstro`. The token/component knowledge options are
 * forwarded to the shared Vite plugin unchanged; Astro-specific concerns
 * (gating, injection, instrumentation) stay internal.
 */
export interface NudgeUiAstroOptions extends NudgeUiOptions {}

const BOOTSTRAP_MODULE_SPECIFIER = "@nudge-ui/astro/bootstrap";
/**
 * The `page` stage emits our content as a Vite-resolved module on every
 * rendered page. The ordering facts that shape it:
 *
 * - React islands do not need our preamble: `@astrojs/react` injects
 *   plugin-react's canonical preamble into the island `before-hydration`
 *   script, which astro-island awaits before importing component modules.
 * - The inspector module graph DOES need the baseline: its sources are
 *   plugin-react-transformed and check `window.$RefreshReg$` at evaluation
 *   time ("can't detect preamble" when missing). This script imports the
 *   bootstrap dynamically, and a dynamic-import continuation always runs
 *   after the importing script's body — so setting the baseline
 *   synchronously here covers the inspector by construction, with no
 *   dependency on the refresh runtime's timing.
 * - `injectIntoGlobalHook` only wires the DevTools hook used to schedule
 *   Fast Refresh (renderers that registered earlier are picked up
 *   retroactively), so it stays async and best-effort — absent in projects
 *   without React tooling, where the `catch` keeps the page load clean.
 * - The baseline no-op values are plugin-react's own canonical preamble
 *   values; transformed modules swap in the real registration functions
 *   around their own evaluation, so the baseline never masks HMR
 *   registration.
 */
const BOOTSTRAP_ENTRY_CONTENT =
  "window.$RefreshReg$ = () => {};" +
  "window.$RefreshSig$ = () => (type) => type;" +
  "window.__vite_plugin_react_preamble_installed__ = true;" +
  'import("/@react-refresh")' +
  ".then((refreshRuntime) => {" +
  "  refreshRuntime.injectIntoGlobalHook(window);" +
  "})" +
  ".catch(() => {});" +
  `import(${JSON.stringify(BOOTSTRAP_MODULE_SPECIFIER)});`;
// Astro loads this URL directly from the installed package. Keep the source
// suffix for the workspace test/dev path and select the compiled sibling in a
// published package, where `middleware.ts` is intentionally not shipped.
const MIDDLEWARE_ENTRYPOINT = new URL(
  import.meta.url.endsWith(".ts") ? "./middleware.ts" : "./middleware.js",
  import.meta.url,
);

/**
 * Nudge UI host Adapter for Astro dev servers (ADR-0011).
 *
 * Dev-only by contract (ADR-0002): unless `command === "dev"` and
 * `enabled !== false`, the integration registers nothing at all — no Vite
 * plugins, no injected scripts, no middleware — so `astro build` output is
 * byte-identical to a project without the integration.
 *
 * In dev it wires three pieces:
 * 1. the shared `nudgeUi()` Vite plugin (token virtual modules, island JSX
 *    identity transforms) plus the project-context plugin, through the
 *    project's Vite config;
 * 2. the inspector bootstrap module, injected through the `page` stage so it
 *    resolves through Vite and loads on every rendered page;
 * 3. an `addMiddleware` response instrumentation that buffers rendered HTML
 *    responses and adds the response-level identity layer through the
 *    identity Module.
 */
export function nudgeUiAstro(options: NudgeUiAstroOptions = {}): AstroIntegration {
  const enabled = options.enabled ?? true;
  // Astro's SSR module runner requires externalized React resolution; the
  // shared plugin's react dedupe aliases would feed it the raw CJS entry.
  const sharedOptions: NudgeUiOptions = { ...options, skipReactAliases: true };

  return {
    name: "nudge-ui",
    hooks: {
      "astro:config:setup"({ command, updateConfig, injectScript, addMiddleware }) {
        if (!enabled || command !== "dev") return;

        // The shared plugin objects are plain Vite plugin records, but this
        // monorepo typechecks them against a different Vite major than the
        // installed Astro resolves internally; the runtime contract
        // (config/resolveId/load/transform hooks) is identical.
        updateConfig({
          vite: {
            plugins: [...nudgeUi(sharedOptions), createProjectContextPlugin()] as never,
          },
        });

        // The `page` stage resolves through Vite (so the bootstrap's
        // virtual-module imports work) and Astro emits it on EVERY rendered
        // page — unlike `before-hydration`, which only rides on hydrated
        // islands.
        injectScript("page", BOOTSTRAP_ENTRY_CONTENT);

        addMiddleware({ entrypoint: MIDDLEWARE_ENTRYPOINT, order: "pre" });
      },
    },
  };
}
