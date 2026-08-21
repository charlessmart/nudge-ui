import type { DesignToolRuntimeConfig } from "@design-tool/inspector";
import type { StandaloneTokenSnapshot } from "./tokenManifest.ts";

/** The reserved URL namespace owned by the standalone Design Tool host. */
export const DESIGN_TOOL_ROUTE_PREFIX = "/__design_tool__/";

/** The manifest consumed by the standalone browser client. */
export const DESIGN_TOOL_MANIFEST_PATH = `${DESIGN_TOOL_ROUTE_PREFIX}manifest`;

/** The prebundled, self-contained inspector client. */
export const DESIGN_TOOL_CLIENT_PATH = `${DESIGN_TOOL_ROUTE_PREFIX}client.mjs`;

/** The same-origin server-sent event stream for settled project changes. */
export const DESIGN_TOOL_RELOAD_PATH = `${DESIGN_TOOL_ROUTE_PREFIX}reload`;

/** The serializable runtime document sent to a standalone client. */
export interface StandaloneRuntimeManifest {
  readonly version: 1;
  /** Monotonically increasing document revision for reload coordination. */
  readonly revision: number;
  readonly runtime: DesignToolRuntimeConfig;
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
      tokenCatalog: tokenSnapshot.tokenCatalog,
      tokens: tokenSnapshot.tokens,
      tokenDiagnostics: tokenSnapshot.tokenDiagnostics,
      tokenGeneration: tokenSnapshot.tokenGeneration,
      componentContracts: [],
    },
    endpoints: {
      manifest: DESIGN_TOOL_MANIFEST_PATH,
      client: DESIGN_TOOL_CLIENT_PATH,
      reload: DESIGN_TOOL_RELOAD_PATH,
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
