import { bootstrapNudgeUi, configureNudgeUiRuntime } from "./index.ts";
import {
  parseNudgeUiClientManifest,
  type NudgeUiClientManifest,
  type NudgeUiRuntimeConfig,
} from "./clientManifest.ts";
import { installStaticHtmlRuntimeIdentity } from "./runtime/staticHtmlRuntimeIdentity.ts";
import { reconcileRuntimeWithDocumentStylesheets } from "./runtime/documentStylesheetOrder.ts";
import { isCanvasRenderer } from "./canvas/roleDetection.ts";

const DEFAULT_MANIFEST_PATH = "/__nudge_ui__/manifest";
const MOUNT_ID = "nudge-ui-root";
const identityPreparedDocuments = new WeakSet<Document>();

/** Fetches one host manifest and mounts the self-contained inspector client. */
export async function bootstrapNudgeUiClient(): Promise<void> {
  const script = document.querySelector<HTMLScriptElement>(
    "script[data-nudge-ui-client]",
  );
  const manifestUrl = script?.dataset.nudgeUiManifest ?? DEFAULT_MANIFEST_PATH;
  const payload = await fetchManifest(manifestUrl);

  configureNudgeUiRuntime(prepareRuntime(payload));
  bootstrapNudgeUi(createMountElement());
  subscribeToManifestReloads(payload, manifestUrl);
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

/** Subscribes to manifest revisions without retrying a failed revision in a loop. */
export function subscribeToManifestReloads(
  manifest: NudgeUiClientManifest,
  manifestUrl: string,
): void {
  if (!manifest.reload || typeof EventSource === "undefined" || isCanvasRenderer()) return;
  const source = new EventSource(manifest.reload.endpoint);
  let seenRevision = manifest.revision;
  let latestObserved = seenRevision;
  let failedRevision = -1;
  let refreshInFlight = false;

  const reconcile = async (): Promise<void> => {
    if (refreshInFlight || latestObserved <= Math.max(seenRevision, failedRevision)) return;
    const requestedRevision = latestObserved;
    refreshInFlight = true;
    try {
      const refreshed = await fetchManifest(manifestUrl);
      configureNudgeUiRuntime(prepareRuntime(refreshed));
      seenRevision = Math.max(seenRevision, refreshed.revision);
      if (refreshed.revision < requestedRevision) {
        failedRevision = Math.max(failedRevision, requestedRevision);
      }
    } catch (error) {
      failedRevision = Math.max(failedRevision, requestedRevision);
      console.warn("[nudge-ui] runtime manifest refresh failed:", error);
    } finally {
      refreshInFlight = false;
      if (latestObserved > Math.max(seenRevision, failedRevision)) void reconcile();
    }
  };

  const handleRevision = (event: Event): void => {
    const revision = parseReloadRevision(event);
    if (revision === null) return;
    latestObserved = Math.max(latestObserved, revision);
    if (manifest.reload?.strategy === "reload-document") {
      if (revision <= seenRevision) return;
      source.close();
      window.location.reload();
      return;
    }
    void reconcile();
  };
  for (const eventName of manifest.reload.events ?? ["message"]) {
    source.addEventListener(eventName, handleRevision);
  }
}

function prepareRuntime(manifest: NudgeUiClientManifest): NudgeUiRuntimeConfig {
  if (manifest.document?.runtimeIdentity === "static-html"
    && !identityPreparedDocuments.has(document)) {
    installStaticHtmlRuntimeIdentity(document);
    identityPreparedDocuments.add(document);
  }
  return manifest.document?.stylesheetOrder === "browser"
    ? reconcileRuntimeWithDocumentStylesheets(manifest.runtime, document)
    : manifest.runtime;
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

if (typeof document !== "undefined" && document.querySelector("script[data-nudge-ui-client]")) {
  void bootstrapNudgeUiClient().catch((error) => {
    console.error("Nudge UI client failed to start.", error);
  });
}
