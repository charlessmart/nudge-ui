import { bootstrapNudgeUi, configureNudgeUiRuntime } from "./index.ts";
import {
  parseNudgeUiClientManifest,
  type NudgeUiClientManifest,
  type NudgeUiRuntimeConfig,
} from "./clientManifest.ts";
import { installStaticHtmlRuntimeIdentity } from "./runtime/staticHtmlRuntimeIdentity.ts";
import { reconcileRuntimeWithDocumentStylesheets } from "./runtime/documentStylesheetOrder.ts";
import { isCanvasRenderer } from "./canvas/roleDetection.ts";
import {
  hasNudgeUiDirectTabIntent,
  hasNudgeUiForcedTabIntent,
  readNudgeUiQuerySwitch,
  rememberNudgeUiTabSwitch,
  resolveNudgeUiClientEntry,
} from "../transport/editor.ts";
import { resetAgentClients } from "./agent/client.ts";
import { getActiveCanvasDocument } from "./canvas/activeCanvasDocument.ts";
export { resolveNudgeUiClientEntry } from "../transport/editor.ts";

const DEFAULT_MANIFEST_PATH = "/__nudge_ui__/manifest";
const MOUNT_ID = "nudge-ui-root";
const identityPreparedDocuments = new WeakSet<Document>();

interface AgentBridgeWindow extends Window {
  __NUDGE_UI_AGENT_BRIDGE__?: { baseUrl: string; autoConnect?: boolean };
}

/** Fetches one host manifest and mounts the self-contained inspector client. */
export async function bootstrapNudgeUiClient(): Promise<void> {
  const script = document.querySelector<HTMLScriptElement>(
    "script[data-nudge-ui-client]",
  );
  const editorDocument = document.documentElement.hasAttribute("data-nudge-ui-editor");
  const canvasRenderer = isCanvasRenderer();
  const urlSwitch = readNudgeUiQuerySwitch(window.location.href);
  if (urlSwitch) rememberNudgeUiTabSwitch(urlSwitch);
  const entry = resolveNudgeUiClientEntry(window.location.href, {
    editorDocument,
    canvasRenderer,
    directTab: hasNudgeUiDirectTabIntent(),
    forcedTab: hasNudgeUiForcedTabIntent(),
    automated: navigator.webdriver === true,
  });
  const manifestUrl = script?.dataset.nudgeUiManifest ?? DEFAULT_MANIFEST_PATH;
  if (entry.kind === "direct") return;
  if (entry.kind === "automated") {
    if ((await fetchManifest(manifestUrl)).inspectAutomatedBrowsers === true) {
      window.location.replace(entry.href);
      return;
    }
    console.info(
      "[nudge-ui] Automated browser detected; the inspector is off. "
        + "Add ?nudge-ui=on to the URL or start the dev server with NUDGE_UI=1 to use it.",
    );
    return;
  }
  if (entry.kind === "redirect") {
    window.location.replace(entry.href);
    return;
  }
  const payload = await fetchManifest(manifestUrl);
  if (editorDocument && !canvasRenderer) {
    console.info(
      "[nudge-ui] Editor active. For the plain app, add ?nudge-ui=off to the URL "
        + "or start the dev server with NUDGE_UI=0.",
    );
  }

  applyAgentBridge(payload, false);
  const runtimeDocument = editorDocument ? findEditorPreviewDocument : () => document;
  configureNudgeUiRuntime(prepareRuntime(payload, runtimeDocument()));
  bootstrapNudgeUi(createMountElement());
  subscribeToManifestReloads(payload, manifestUrl, runtimeDocument);
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
  runtimeDocument: () => Document | null = () => document,
): void {
  if (!manifest.reload || typeof EventSource === "undefined") return;
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
      applyAgentBridge(refreshed, true);
      configureNudgeUiRuntime(prepareRuntime(refreshed, runtimeDocument()));
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

function applyAgentBridge(manifest: NudgeUiClientManifest, reloadOnChange: boolean): void {
  const target = window as AgentBridgeWindow;
  const current = target.__NUDGE_UI_AGENT_BRIDGE__;
  const next = manifest.agentBridge;
  if (current?.baseUrl !== next?.baseUrl || current?.autoConnect !== next?.autoConnect) {
    if (next) target.__NUDGE_UI_AGENT_BRIDGE__ = next;
    else delete target.__NUDGE_UI_AGENT_BRIDGE__;
    resetAgentClients();
    if (reloadOnChange) window.location.reload();
  }
}

function prepareRuntime(
  manifest: NudgeUiClientManifest,
  runtimeDocument: Document | null,
): NudgeUiRuntimeConfig {
  if (runtimeDocument && manifest.document?.runtimeIdentity === "static-html"
    && !identityPreparedDocuments.has(runtimeDocument)) {
    installStaticHtmlRuntimeIdentity(runtimeDocument);
    identityPreparedDocuments.add(runtimeDocument);
  }
  return runtimeDocument && manifest.document?.stylesheetOrder === "browser"
    ? reconcileRuntimeWithDocumentStylesheets(manifest.runtime, runtimeDocument)
    : manifest.runtime;
}

function findEditorPreviewDocument(): Document | null {
  return getActiveCanvasDocument();
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
