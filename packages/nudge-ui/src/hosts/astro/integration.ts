import type { AstroIntegration, AstroUserConfig } from "astro";
import { nudgeUi, type NudgeUiOptions } from "../vite/index.ts";
import { NUDGE_UI_CLIENT_PATH, NUDGE_UI_MANIFEST_PATH } from "../../transport/index.ts";
import {
  createAstroClientTransportPlugin,
} from "./clientTransport.ts";
import { createProjectContextPlugin } from "./projectContext.ts";

export type { NudgeUiOptions };

/**
 * Options for `nudgeUiAstro`. The token/component knowledge options are
 * forwarded to the shared Vite plugin unchanged; Astro-specific concerns
 * (gating, injection, instrumentation) stay internal.
 */
export interface NudgeUiAstroOptions extends NudgeUiOptions {}

/**
 * Adds the prebuilt client as an external module. The inspector dependency
 * graph therefore never enters Astro's Vite optimizer.
 */
const BOOTSTRAP_ENTRY_CONTENT = [
  'if (!document.querySelector("script[data-nudge-ui-client]")) {',
  '  const script = document.createElement("script");',
  '  script.type = "module";',
  `  script.src = ${JSON.stringify(NUDGE_UI_CLIENT_PATH)};`,
  '  script.setAttribute("data-nudge-ui-client", "");',
  `  script.dataset.nudgeUiManifest = ${JSON.stringify(NUDGE_UI_MANIFEST_PATH)};`,
  "  document.head.append(script);",
  "}",
].join("\n");
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
 * 1. the shared `nudgeUi()` Vite plugin (token knowledge and island JSX
 *    identity transforms), the client transport, and project context;
 * 2. one external client script, injected on every rendered page;
 * 3. an `addMiddleware` response instrumentation that buffers rendered HTML
 *    responses and adds the response-level identity layer through the
 *    identity Module.
 */
export function nudgeUiAstro(options: NudgeUiAstroOptions = {}): AstroIntegration {
  const enabled = options.enabled ?? true;
  const sharedOptions: NudgeUiOptions = { ...options };

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
            // SAFETY: Astro and this package resolve different Vite type
            // versions, but both consume the same runtime Plugin contract.
            plugins: [
              createAstroClientTransportPlugin(),
              ...nudgeUi(sharedOptions),
              createProjectContextPlugin(),
            ] as never,
          },
        });

        // The page stage runs on every rendered page. It only appends an
        // external script; no inspector dependency enters Vite's graph.
        injectScript("page", BOOTSTRAP_ENTRY_CONTENT);

        addMiddleware({ entrypoint: MIDDLEWARE_ENTRYPOINT, order: "pre" });
      },
    },
  };
}

/**
 * Adds Nudge UI to an Astro configuration without inspecting its shape.
 *
 * This wrapper is the stable installer seam. It works with shorthand,
 * variable, spread, and computed integration lists because it treats the
 * configuration as a value rather than rewriting `integrations`.
 */
export function withNudgeUi(
  config: AstroUserConfig,
  options: NudgeUiAstroOptions = {},
): AstroUserConfig {
  const integrations = config.integrations ?? [];
  if (containsNudgeUiIntegration(integrations)) return config;
  return {
    ...config,
    integrations: [...integrations, nudgeUiAstro(options)],
  };
}

function containsNudgeUiIntegration(
  integrations: NonNullable<AstroUserConfig["integrations"]>,
): boolean {
  return integrations.some((integration) => {
    if (Array.isArray(integration)) return containsNudgeUiIntegration(integration);
    return integration !== false
      && integration !== null
      && integration !== undefined
      && integration.name === "nudge-ui";
  });
}
