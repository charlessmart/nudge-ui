import type { DesignToolRuntimeConfig } from "@design-tool/inspector";

/** Runtime document accepted by the standalone browser bootstrap. */
export interface StandaloneClientManifest {
  readonly version: 1;
  readonly revision: number;
  readonly runtime: DesignToolRuntimeConfig;
  readonly endpoints: {
    readonly manifest: string;
    readonly client: string;
    readonly reload: string;
  };
}

/** Validates the external manifest before shared runtime state is replaced. */
export function isStandaloneClientManifest(
  value: unknown,
): value is StandaloneClientManifest {
  if (!isRecord(value)
    || value.version !== 1
    || !Number.isInteger(value.revision)
    || (value.revision as number) < 0
    || !isRecord(value.runtime)) return false;
  const runtime = value.runtime;
  return runtime.host === "static-html"
    && runtime.framework === "HTML"
    && typeof runtime.projectId === "string"
    && runtime.projectId.length > 0
    && typeof runtime.stylingSystem === "string"
    && isRecord(runtime.capabilities)
    && runtime.capabilities.canvas === true
    && runtime.capabilities.componentSemantics === false
    && typeof runtime.tokenGeneration === "string"
    && Array.isArray(runtime.tokenCatalog)
    && Array.isArray(runtime.tokens)
    && Array.isArray(runtime.tokenDiagnostics)
    && Array.isArray(runtime.componentContracts)
    && isRecord(value.endpoints)
    && isReservedEndpoint(value.endpoints.manifest)
    && isReservedEndpoint(value.endpoints.client)
    && isReservedEndpoint(value.endpoints.reload);
}

function isReservedEndpoint(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("/__design_tool__/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
