import {
  createNudgeUiClientManifest,
  type NudgeUiClientManifest,
} from "../../inspector/clientManifest.ts";
import type { ProjectTokenSnapshot } from "../../project/tokens.ts";
import { NUDGE_UI_RELOAD_PATH } from "../../transport/index.ts";
import { automationManifestFields } from "../environment.ts";

export {
  NUDGE_UI_CLIENT_PATH,
  NUDGE_UI_EDITOR_PATH,
  NUDGE_UI_MANIFEST_PATH,
  NUDGE_UI_MOUNT_ID,
  NUDGE_UI_RELOAD_PATH,
  NUDGE_UI_ROUTE_PREFIX,
} from "../../transport/index.ts";

export type StandaloneRuntimeManifest = NudgeUiClientManifest;

export function createStandaloneRuntimeManifest(
  projectId: string,
  tokenSnapshot: ProjectTokenSnapshot = emptyTokenSnapshot(),
  revision = 0,
): StandaloneRuntimeManifest {
  return createNudgeUiClientManifest({
    revision,
    runtime: {
      projectId,
      host: "static-html",
      framework: "HTML",
      stylingSystem: "CSS custom properties",
      // Canvas shares the Vite host's controller/renderer runtime (ADR-0012).
      capabilities: { canvas: true, componentSemantics: false, domNavigation: true },
      tokenCatalog: tokenSnapshot.tokenCatalog,
      tokens: tokenSnapshot.tokens,
      tokenDiagnostics: tokenSnapshot.tokenDiagnostics,
      tokenGeneration: tokenSnapshot.tokenGeneration,
      componentContracts: [],
    },
    document: {
      runtimeIdentity: "static-html",
      stylesheetOrder: "browser",
    },
    reload: {
      endpoint: NUDGE_UI_RELOAD_PATH,
      strategy: "reload-document",
      events: ["ready", "reload"],
    },
    ...automationManifestFields(),
  });
}

function emptyTokenSnapshot(): ProjectTokenSnapshot {
  return {
    tokenCatalog: [],
    tokens: [],
    tokenDiagnostics: [],
    tokenGeneration: "empty",
  };
}
