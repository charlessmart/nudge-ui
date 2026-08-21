import type { DesignToolRuntimeConfig } from "@design-tool/inspector";

/** The reserved URL namespace owned by the standalone Design Tool host. */
export const DESIGN_TOOL_ROUTE_PREFIX = "/__design_tool__/";

/** The manifest consumed by the standalone browser client. */
export const DESIGN_TOOL_MANIFEST_PATH = `${DESIGN_TOOL_ROUTE_PREFIX}manifest`;

/** The prebundled, self-contained inspector client. */
export const DESIGN_TOOL_CLIENT_PATH = `${DESIGN_TOOL_ROUTE_PREFIX}client.mjs`;

/** The serializable runtime document sent to a standalone client. */
export interface StandaloneRuntimeManifest {
  readonly version: 1;
  readonly runtime: DesignToolRuntimeConfig;
  readonly endpoints: {
    readonly manifest: string;
    readonly client: string;
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
): StandaloneRuntimeManifest {
  return {
    version: 1,
    runtime: {
      projectId,
      host: "static-html",
      framework: "HTML",
      stylingSystem: "CSS custom properties",
      tokenCatalog: [],
      tokens: [],
      tokenDiagnostics: [],
      tokenGeneration: "empty",
      componentContracts: [],
    },
    endpoints: {
      manifest: DESIGN_TOOL_MANIFEST_PATH,
      client: DESIGN_TOOL_CLIENT_PATH,
    },
  };
}
