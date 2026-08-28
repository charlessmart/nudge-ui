import {
  bootstrapNudgeUi,
  configureNudgeUiRuntime,
  installStaticHtmlRuntimeIdentity,
  isCanvasRenderer,
} from "@nudge-ui/inspector";
import { NUDGE_UI_MOUNT_ID } from "./manifest.ts";
import {
  isStandaloneClientManifest,
  type StandaloneClientManifest,
} from "./clientManifest.ts";
import { reconcileStandaloneRuntime } from "./stylesheetOrder.ts";

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
    "script[data-nudge-ui-client]",
  );
  const manifestUrl = script?.dataset.nudgeUiManifest ?? "/__nudge_ui__/manifest";
  const response = await fetch(manifestUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Nudge UI manifest request failed with HTTP ${response.status}.`);
  }
  const payload: unknown = await response.json();
  if (!isStandaloneClientManifest(payload)) {
    throw new Error("Nudge UI manifest did not contain a valid static-HTML runtime.");
  }

  configureNudgeUiRuntime(reconcileStandaloneRuntime(payload.runtime, document));
  const host = document.getElementById(NUDGE_UI_MOUNT_ID);
  if (!host) throw new Error("Nudge UI mount element is missing from the document.");
  installStaticHtmlRuntimeIdentity(document);
  bootstrapNudgeUi(host);
  connectStandaloneReload(payload);
}

/** Connects the browser to the server's settled-revision transport. */
export function connectStandaloneReload(manifest: StandaloneClientManifest): void {
  if (typeof EventSource === "undefined") return;
  // Canvas renderers never reload themselves: the controller document reloads
  // first and recreates its card iframes, so a renderer reloading too would
  // only duplicate every document fetch. An orphaned renderer cannot exist —
  // iframes do not outlive their parent document.
  if (isCanvasRenderer()) return;
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
    console.error("Nudge UI standalone client failed to start.", error);
  });
}
