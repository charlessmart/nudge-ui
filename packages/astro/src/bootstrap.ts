import { bootstrapNudgeUi, configureNudgeUiRuntime, detectFramework } from "@nudge-ui/inspector";
import {
  nudgeUiProjectId,
  tokenCatalog,
  tokenDiagnostics,
  tokenGeneration,
  tokens,
} from "virtual:design-tokens";
import { componentContracts } from "virtual:nudge-ui-components";

const NUDGE_UI_MOUNT_ID = "nudge-ui-root";
const ASTRO_SCOPING_SELECTOR_PATTERN =
  "\\[data-astro-cid-[^\\]]*\\]|\\.astro-[a-zA-Z0-9_-]+";
const ASTRO_SOURCE_COORDINATES = {
  exactCidPrefixes: ["astro:"],
  exactFileExtensions: [".astro", ".html", ".htm"],
} as const;

/**
 * Legacy browser bootstrap retained for the published `./bootstrap` subpath.
 * New integrations use the self-contained client transport instead.
 */
function configure(): void {
  configureNudgeUiRuntime({
    projectId: nudgeUiProjectId,
    host: "astro",
    framework: "Astro",
    stylingSystem: detectFramework(tokens).stylingSystem,
    capabilities: {
      canvas: false,
      componentSemantics: true,
      sourceCoordinates: ASTRO_SOURCE_COORDINATES,
      scopingSelectorPattern: ASTRO_SCOPING_SELECTOR_PATTERN,
    },
    tokenCatalog,
    tokens,
    tokenDiagnostics,
    tokenGeneration,
    componentContracts,
  });
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
