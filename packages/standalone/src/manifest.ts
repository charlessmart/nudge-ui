import type { NudgeUiRuntimeConfig } from "@nudge-ui/inspector";
import type { StandaloneTokenSnapshot } from "./tokenManifest.ts";

/** The reserved URL namespace owned by the standalone Nudge UI host. */
export const NUDGE_UI_ROUTE_PREFIX = "/__nudge_ui__/";

/** The only mount ID supported by the standalone host contract. */
export const NUDGE_UI_MOUNT_ID = "nudge-ui-root";

/** The manifest consumed by the standalone browser client. */
export const NUDGE_UI_MANIFEST_PATH = `${NUDGE_UI_ROUTE_PREFIX}manifest`;

/** The prebundled, self-contained inspector client. */
export const NUDGE_UI_CLIENT_PATH = `${NUDGE_UI_ROUTE_PREFIX}client.mjs`;

/** The same-origin server-sent event stream for settled project changes. */
export const NUDGE_UI_RELOAD_PATH = `${NUDGE_UI_ROUTE_PREFIX}reload`;

/** The serializable runtime document sent to a standalone client. */
export interface StandaloneRuntimeManifest {
  readonly version: 1;
  /** Monotonically increasing document revision for reload coordination. */
  readonly revision: number;
  readonly runtime: NudgeUiRuntimeConfig;
  readonly endpoints: {
    readonly manifest: string;
    readonly client: string;
    readonly reload: string;
  };
}

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
  tokenSnapshot: StandaloneTokenSnapshot = emptyTokenSnapshot(),
  revision = 0,
): StandaloneRuntimeManifest {
  return {
    version: 1,
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
    endpoints: {
      manifest: NUDGE_UI_MANIFEST_PATH,
      client: NUDGE_UI_CLIENT_PATH,
      reload: NUDGE_UI_RELOAD_PATH,
    },
  };
}

function emptyTokenSnapshot(): StandaloneTokenSnapshot {
  return {
    tokenCatalog: [],
    tokens: [],
    tokenDiagnostics: [],
    tokenGeneration: "empty",
  };
}
