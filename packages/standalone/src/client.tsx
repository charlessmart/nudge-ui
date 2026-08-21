import {
  bootstrapDesignTool,
  configureDesignToolRuntime,
  installStaticHtmlRuntimeIdentity,
} from "@design-tool/inspector";
import {
  isStandaloneClientManifest,
  type StandaloneClientManifest,
} from "./clientManifest.ts";

export { isStandaloneClientManifest } from "./clientManifest.ts";

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
  installStaticHtmlRuntimeIdentity(document);
  bootstrapDesignTool(host);
  connectStandaloneReload(payload);
}

/** Connects the browser to the server's settled-revision transport. */
export function connectStandaloneReload(manifest: StandaloneClientManifest): void {
  if (typeof EventSource === "undefined") return;
  const source = new EventSource(manifest.endpoints.reload);
  const handleRevision = (event: Event): void => {
    const revision = parseReloadRevision(event);
    if (revision === null || revision <= manifest.revision) return;
    source.close();
    window.location.reload();
  };
  source.addEventListener("ready", handleRevision);
  source.addEventListener("reload", handleRevision);
}

function parseReloadRevision(event: Event): number | null {
  if (!(event instanceof MessageEvent) || typeof event.data !== "string") return null;
  try {
    const payload: unknown = JSON.parse(event.data);
    if (!isRecord(payload) || !Number.isInteger(payload.revision)) return null;
    return (payload.revision as number) >= 0 ? payload.revision as number : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

if (typeof document !== "undefined") {
  void bootstrapStandaloneClient().catch((error: unknown) => {
    console.error("Design Tool standalone client failed to start.", error);
  });
}
