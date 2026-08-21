import {
  bootstrapDesignTool,
  configureDesignToolRuntime,
  type DesignToolRuntimeConfig,
} from "@design-tool/inspector";

interface StandaloneClientManifest {
  readonly version: 1;
  readonly runtime: DesignToolRuntimeConfig;
  readonly endpoints: {
    readonly manifest: string;
    readonly client: string;
  };
}

/**
 * Fetches the host manifest, validates its runtime shape, and mounts the
 * shared inspector into the server-owned document element.
 *
 * No configuration or JSON is embedded in the HTML response. The browser
 * receives one external module and one external manifest request, which also
 * keeps the standalone path compatible with a strict `script-src` policy.
 */
export async function bootstrapStandaloneClient(): Promise<void> {
  const script = document.querySelector<HTMLScriptElement>(
    "script[data-design-tool-client]",
  );
  const manifestUrl = script?.dataset.designToolManifest ?? "/__design_tool__/manifest";
  const response = await fetch(manifestUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Design Tool manifest request failed with HTTP ${response.status}.`);
  }
  const payload: unknown = await response.json();
  if (!isStandaloneClientManifest(payload)) {
    throw new Error("Design Tool manifest did not contain a valid static-HTML runtime.");
  }

  configureDesignToolRuntime(payload.runtime);
  const host = document.getElementById("design-tool-root");
  if (!host) throw new Error("Design Tool mount element is missing from the document.");
  bootstrapDesignTool(host);
}

/** Validates the external manifest before shared runtime state is replaced. */
export function isStandaloneClientManifest(
  value: unknown,
): value is StandaloneClientManifest {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.runtime)) return false;
  const runtime = value.runtime;
  return runtime.host === "static-html"
    && runtime.framework === "HTML"
    && typeof runtime.projectId === "string"
    && typeof runtime.stylingSystem === "string"
    && typeof runtime.tokenGeneration === "string"
    && Array.isArray(runtime.tokenCatalog)
    && Array.isArray(runtime.tokens)
    && Array.isArray(runtime.tokenDiagnostics)
    && Array.isArray(runtime.componentContracts)
    && isRecord(value.endpoints)
    && typeof value.endpoints.manifest === "string"
    && typeof value.endpoints.client === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (typeof document !== "undefined") {
  void bootstrapStandaloneClient().catch((error: unknown) => {
    console.error("Design Tool standalone client failed to start.", error);
  });
}
