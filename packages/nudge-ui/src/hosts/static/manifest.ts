import type { NudgeUiClientManifest } from "@nudge-ui/inspector/client-manifest";
import type { ProjectTokenSnapshot } from "../../project/tokens.ts";
import { NUDGE_UI_MANIFEST_VERSION, NUDGE_UI_RELOAD_PATH } from "../../transport/index.ts";

export {
  NUDGE_UI_CLIENT_PATH,
  NUDGE_UI_MANIFEST_PATH,
  NUDGE_UI_MOUNT_ID,
  NUDGE_UI_RELOAD_PATH,
  NUDGE_UI_ROUTE_PREFIX,
} from "../../transport/index.ts";

/** The serializable runtime document sent to a standalone client. */
export interface StandaloneRuntimeManifest extends NudgeUiClientManifest {}

/**
 * Creates the first valid static-HTML runtime snapshot.
 *
 * Stage 4 replaces the empty token arrays with the CSS token-inventory
 * snapshot. Keeping this constructor here makes the manifest contract
 * explicit and prevents the server from manufacturing a partial runtime
 * configuration.
 *
 * @param projectId The deterministic identity of the served project.
 * @returns A complete runtime manifest with no framework contracts or tokens.
 */
export function createStandaloneRuntimeManifest(
  projectId: string,
  tokenSnapshot: ProjectTokenSnapshot = emptyTokenSnapshot(),
  revision = 0,
): StandaloneRuntimeManifest {
  return {
    version: NUDGE_UI_MANIFEST_VERSION,
    revision,
    runtime: {
      projectId,
      host: "static-html",
      framework: "HTML",
      stylingSystem: "CSS custom properties",
      // Canvas shares the Vite host's controller/renderer runtime (ADR-0012):
      // every served document carries the bootstrap, so card iframes boot as
      // renderers without host-specific code.
      capabilities: { canvas: true, componentSemantics: false },
      tokenCatalog: tokenSnapshot.tokenCatalog,
      tokens: tokenSnapshot.tokens,
      tokenDiagnostics: tokenSnapshot.tokenDiagnostics,
      tokenGeneration: tokenSnapshot.tokenGeneration,
      componentContracts: [],
    },
    document: {
      runtimeIdentity: "static-html",
      stylesheetOrder: "browser",
    },
    reload: {
      endpoint: NUDGE_UI_RELOAD_PATH,
      strategy: "reload-document",
      events: ["ready", "reload"],
    },
  };
}

function emptyTokenSnapshot(): ProjectTokenSnapshot {
  return {
    tokenCatalog: [],
    tokens: [],
    tokenDiagnostics: [],
    tokenGeneration: "empty",
  };
}
