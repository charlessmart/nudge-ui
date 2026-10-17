import {
  createNudgeUiClientManifest,
  type NudgeUiClientManifest,
  type NudgeUiRuntimeConfig,
} from "../../inspector/clientManifest.ts";
import { createProjectId } from "../../project/identity.ts";
import { NUDGE_UI_RELOAD_PATH } from "../../transport/index.ts";

export interface NudgeUiManifestInput {
  root: string;
}

type MutableRuntime = Omit<
  NudgeUiRuntimeConfig,
  "tokenCatalog" | "tokens" | "tokenDiagnostics" | "componentContracts" | "tokenGeneration"
> & {
  tokenCatalog: NudgeUiRuntimeConfig["tokenCatalog"];
  tokens: NudgeUiRuntimeConfig["tokens"];
  tokenDiagnostics: NudgeUiRuntimeConfig["tokenDiagnostics"];
  tokenGeneration: string;
  componentContracts: NudgeUiRuntimeConfig["componentContracts"];
};

export interface NudgeUiManifest extends Omit<NudgeUiClientManifest, "runtime"> {
  readonly runtime: MutableRuntime;
}

/** Shape-compatible with the standalone adapter's snapshot so the shared scanner feeds both hosts. */
export interface NudgeUiTokenSnapshot {
  tokenCatalog: NudgeUiRuntimeConfig["tokenCatalog"];
  tokens: NudgeUiRuntimeConfig["tokens"];
  tokenDiagnostics: NudgeUiRuntimeConfig["tokenDiagnostics"];
  tokenGeneration: string;
}

export function nextjsProjectId(root: string): string {
  return createProjectId("nextjs", root);
}

export function buildManifest(input: NudgeUiManifestInput): NudgeUiManifest {
  const runtime: MutableRuntime = {
    projectId: nextjsProjectId(input.root),
    host: "nextjs-react",
    framework: "React",
    stylingSystem: "CSS custom properties",
    // Canvas shares the Vite host's controller/renderer runtime (ADR-0006).
    capabilities: { canvas: true, componentSemantics: true, domNavigation: true },
    tokenCatalog: [],
    tokens: [],
    tokenDiagnostics: [],
    tokenGeneration: "",
    componentContracts: [],
  };
  return createNudgeUiClientManifest({
    runtime,
    reload: {
      endpoint: NUDGE_UI_RELOAD_PATH,
      strategy: "refresh-manifest",
    },
  });
}
