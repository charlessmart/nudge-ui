import { bootstrapNudgeUi, configureNudgeUiRuntime } from "./index.ts";
import { parseNudgeUiClientManifest } from "./clientManifest.ts";
import { installStaticHtmlRuntimeIdentity } from "./runtime/staticHtmlRuntimeIdentity.ts";
import { reconcileRuntimeWithDocumentStylesheets } from "./runtime/documentStylesheetOrder.ts";
import { isCanvasRenderer } from "./canvas/roleDetection.ts";

const DEFAULT_MANIFEST_PATH = "/__nudge_ui__/manifest";
const MOUNT_ID = "nudge-ui-root";

/** Fetches one host manifest and mounts the self-contained inspector client. */
export async function bootstrapNudgeUiClient(): Promise<void> {
  const script = document.querySelector<HTMLScriptElement>(
    "script[data-nudge-ui-client]",
  );
  const manifestUrl = script?.dataset.nudgeUiManifest ?? DEFAULT_MANIFEST_PATH;
  const payload = await fetchManifest(manifestUrl);

  configureNudgeUiRuntime(payload.document?.stylesheetOrder === "browser"
    ? reconcileRuntimeWithDocumentStylesheets(payload.runtime, document)
    : payload.runtime);
  if (payload.document?.runtimeIdentity === "static-html") {
    installStaticHtmlRuntimeIdentity(document);
  }
  bootstrapNudgeUi(createMountElement());
  connectReload(payload, manifestUrl);
}

async function fetchManifest(manifestUrl: string) {
  const response = await fetch(manifestUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Nudge UI manifest request failed with HTTP ${response.status}.`);
  }
  const manifest = parseNudgeUiClientManifest(await response.json());
  if (!manifest) {
    throw new Error("Nudge UI manifest did not contain a valid runtime configuration.");
  }
  return manifest;
}

function connectReload(
  manifest: Awaited<ReturnType<typeof fetchManifest>>,
  manifestUrl: string,
): void {
  if (!manifest.reload || typeof EventSource === "undefined" || isCanvasRenderer()) return;
  const source = new EventSource(manifest.reload.endpoint);
  const handleRevision = (event: Event): void => {
    const revision = parseReloadRevision(event);
    if (revision === null || revision <= manifest.revision) return;
    source.close();
    if (manifest.reload?.strategy === "reload-document") {
      window.location.reload();
      return;
    }
    void fetchManifest(manifestUrl).then((refreshed) => {
      configureNudgeUiRuntime(refreshed.runtime);
      connectReload(refreshed, manifestUrl);
    }).catch((error) => {
      console.warn("[nudge-ui] runtime manifest refresh failed:", error);
      connectReload(manifest, manifestUrl);
    });
  };
  for (const eventName of manifest.reload.events ?? ["message"]) {
    source.addEventListener(eventName, handleRevision);
  }
}

function parseReloadRevision(event: Event): number | null {
  if (!(event instanceof MessageEvent) || typeof event.data !== "string") return null;
  try {
    const payload: unknown = JSON.parse(event.data);
    if (typeof payload !== "object" || payload === null || !("revision" in payload)) return null;
    const revision = payload.revision;
    return typeof revision === "number" && Number.isInteger(revision) && revision >= 0
      ? revision
      : null;
  } catch {
    return null;
  }
}

function createMountElement(): HTMLElement {
  const existing = document.getElementById(MOUNT_ID);
  if (existing !== null && existing.isConnected) return existing;
  const mount = existing ?? document.createElement("div");
  mount.id = MOUNT_ID;
  document.body.append(mount);
  return mount;
}

if (typeof document !== "undefined") {
  void bootstrapNudgeUiClient().catch((error) => {
    console.error("Nudge UI client failed to start.", error);
  });
}
