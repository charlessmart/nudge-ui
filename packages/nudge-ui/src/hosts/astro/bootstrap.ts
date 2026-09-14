import { bootstrapNudgeUi, configureNudgeUiRuntime } from "@nudge-ui/inspector";
import {
  nudgeUiProjectId,
  tokenCatalog,
  tokenDiagnostics,
  tokenGeneration,
  tokens,
} from "virtual:design-tokens";
import { componentContracts } from "virtual:nudge-ui-components";
import { createAstroRuntimeConfig } from "./astroRuntimeConfig.ts";

const NUDGE_UI_MOUNT_ID = "nudge-ui-root";

/**
 * Legacy browser bootstrap retained for the published `./bootstrap` subpath.
 * New integrations use the self-contained client transport instead.
 */
function configure(): void {
  configureNudgeUiRuntime(createAstroRuntimeConfig({
    projectId: nudgeUiProjectId,
    tokenCatalog,
    tokens,
    tokenDiagnostics,
    tokenGeneration,
    componentContracts,
  }));
}

function createMountElement(): HTMLElement {
  const existing = document.getElementById(NUDGE_UI_MOUNT_ID);
  if (existing !== null && existing.isConnected) return existing;
  const mount = existing ?? document.createElement("div");
  mount.id = NUDGE_UI_MOUNT_ID;
  document.body.append(mount);
  return mount;
}

configure();
bootstrapNudgeUi(createMountElement());
