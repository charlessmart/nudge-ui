import type { AstroIntegration } from "astro";
import { designTool, type DesignToolOptions } from "@design-tool/plugin";
import { createProjectContextPlugin } from "./projectContext.ts";

export type { DesignToolOptions };

/**
 * Options for `designToolAstro`. The token/component knowledge options are
 * forwarded to the shared Vite plugin unchanged; Astro-specific concerns
 * (gating, injection, instrumentation) stay internal.
 */
export interface DesignToolAstroOptions extends DesignToolOptions {}

const BOOTSTRAP_MODULE_SPECIFIER = "@design-tool/astro/bootstrap";
/**
 * The `page` stage emits our content as a Vite-resolved module on every
 * rendered page. Two ordering facts shape it:
 *
 * - React islands' HMR registrations need plugin-react's refresh runtime
 *   primed first; Astro never runs plugin-react's HTML preamble transform,
 *   so shared inspector sources would otherwise evaluate with `$RefreshSig$`
 *   undefined. Run plugin-react's official preamble here, defensively
 *   skipped when React tooling is absent.
 * - Static imports would hoist above any priming statements (ESM semantics),
 *   so the bootstrap itself is imported dynamically after priming settles.
 *
 * Accepted ordering assumption: priming is an async chain, while a hydrated
 * island's module graph may evaluate `$RefreshSig$()` at import time. The
 * `page` script is emitted in the head and starts before body/island module
 * evaluation, and Astro's dev server serves `/@react-refresh` from memory, so
 * the promise settles first in practice. If this ever races, the symptom is
 * `$RefreshSig$ is not defined` during island evaluation — revisit the stage
 * choice (or inline the priming statements) before changing anything else.
 */
const BOOTSTRAP_ENTRY_CONTENT =
  'import("/@react-refresh")' +
  ".then((refreshRuntime) => {" +
  "  refreshRuntime.injectIntoGlobalHook(window);" +
  '  window.$RefreshReg$ = () => {};' +
  '  window.$RefreshSig$ = () => (type) => type;' +
  "  window.__vite_plugin_react_preamble_installed__ = true;" +
  "})" +
  ".catch(() => {})" +
  `.then(() => import(${JSON.stringify(BOOTSTRAP_MODULE_SPECIFIER)}));`;
const MIDDLEWARE_ENTRYPOINT = new URL("./middleware.ts", import.meta.url);

/**
 * Design Tool host Adapter for Astro dev servers (ADR-0011).
 *
 * Dev-only by contract (ADR-0002): unless `command === "dev"` and
 * `enabled !== false`, the integration registers nothing at all — no Vite
 * plugins, no injected scripts, no middleware — so `astro build` output is
 * byte-identical to a project without the integration.
 *
 * In dev it wires three pieces:
 * 1. the shared `designTool()` Vite plugin (token virtual modules, island JSX
 *    identity transforms) plus the project-context plugin, through the
 *    project's Vite config;
 * 2. the inspector bootstrap module, injected through the `page` stage so it
 *    resolves through Vite and loads on every rendered page;
 * 3. an `addMiddleware` response instrumentation that buffers rendered HTML
 *    responses and adds the response-level identity layer through the
 *    identity Module.
 */
export function designToolAstro(options: DesignToolAstroOptions = {}): AstroIntegration {
  const enabled = options.enabled ?? true;
  // Astro's SSR module runner requires externalized React resolution; the
  // shared plugin's react dedupe aliases would feed it the raw CJS entry.
  const sharedOptions: DesignToolOptions = { ...options, skipReactAliases: true };

  return {
    name: "design-tool",
    hooks: {
      "astro:config:setup"({ command, updateConfig, injectScript, addMiddleware }) {
        if (!enabled || command !== "dev") return;

        // The shared plugin objects are plain Vite plugin records, but this
        // monorepo typechecks them against a different Vite major than the
        // installed Astro resolves internally; the runtime contract
        // (config/resolveId/load/transform hooks) is identical.
        updateConfig({
          vite: {
            plugins: [...designTool(sharedOptions), createProjectContextPlugin()] as never,
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
