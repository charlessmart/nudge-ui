import {
  bootstrapNudgeUi,
  configureNudgeUiRuntime,
} from "./index.ts";
import { parseNudgeUiClientManifest } from "./clientManifest.ts";

const DEFAULT_MANIFEST_PATH = "/__nudge_ui__/manifest";
const MOUNT_ID = "nudge-ui-root";

/** Fetches one host manifest and mounts the self-contained inspector client. */
export async function bootstrapNudgeUiClient(): Promise<void> {
  const script = document.querySelector<HTMLScriptElement>(
    "script[data-nudge-ui-client]",
  );
  const manifestUrl = script?.dataset.nudgeUiManifest ?? DEFAULT_MANIFEST_PATH;
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

  configureNudgeUiRuntime(manifest.runtime);
  bootstrapNudgeUi(createMountElement());
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
