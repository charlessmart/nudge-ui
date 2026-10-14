import { fileURLToPath } from "node:url";
import type { AstroIntegration, AstroUserConfig } from "astro";
import { nudgeUi, type NudgeUiOptions } from "../vite/index.ts";
import { NUDGE_UI_CLIENT_PATH, NUDGE_UI_MANIFEST_PATH } from "../../transport/index.ts";
import {
  createAstroClientTransportPlugin,
} from "./clientTransport.ts";
import { createProjectContextPlugin } from "./projectContext.ts";
import { isNudgeUiEnabled } from "../environment.ts";
import { installMarkdownIdentity } from "./markdownIdentity.ts";

export type { NudgeUiOptions };

export interface NudgeUiAstroOptions extends NudgeUiOptions {}

/** Loads the prebuilt client as an external module so the inspector graph never enters Astro's Vite optimizer. */
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
// Astro loads this URL directly from the installed package: the .ts sibling serves
// workspace dev, while the compiled .js sibling ships in the published package.
const MIDDLEWARE_ENTRYPOINT = new URL(
  import.meta.url.endsWith(".ts") ? "./middleware.ts" : "./middleware.js",
  import.meta.url,
);

/** Dev-only by contract: outside `command === "dev"` with Nudge UI enabled, nothing is registered, so `astro build` output is byte-identical to a project without the integration. */
export function nudgeUiAstro(options: NudgeUiAstroOptions = {}): AstroIntegration {
  const enabled = isNudgeUiEnabled(options.enabled);
  const sharedOptions: NudgeUiOptions = { ...options };

  return {
    name: "nudge-ui",
    hooks: {
      "astro:config:setup"({ command, config, updateConfig, injectScript, addMiddleware }) {
        if (!enabled || command !== "dev") return;

        const markdown = installMarkdownIdentity(config.markdown, fileURLToPath(config.root));

        // Plain Vite plugin records; the monorepo typechecks them against a different Vite
        // major than Astro resolves, but the runtime contract is identical.
        updateConfig({
          ...(markdown ? { markdown } : {}),
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

        injectScript("page", BOOTSTRAP_ENTRY_CONTENT);

        addMiddleware({ entrypoint: MIDDLEWARE_ENTRYPOINT, order: "pre" });
      },
    },
  };
}

/** Treats the configuration as a value, so shorthand, variable, spread and computed integration lists all work. */
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
