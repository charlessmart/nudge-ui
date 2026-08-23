import { bootstrapDesignTool, configureDesignToolRuntime, detectFramework } from "@design-tool/inspector";
import {
  designToolProjectId,
  tokenCatalog,
  tokenDiagnostics,
  tokenGeneration,
  tokens,
} from "virtual:design-tokens";
import { componentContracts } from "virtual:design-tool-components";

const DESIGN_TOOL_MOUNT_ID = "design-tool-root";

/**
 * Browser bootstrap injected into every Astro dev page (ADR-0011).
 *
 * Runs once per document load, before island hydration. Token and component
 * knowledge arrive through the shared plugin's virtual modules; replacing the
 * runtime configuration is atomic, so a re-executed bootstrap (fresh page
 * after Vite's full reload on a token change) always observes one coherent
 * snapshot.
 *
 * The mount element is created here rather than injected into page markup:
 * the rendered document stays exactly as Astro produced it plus the identity
 * attributes added server-side.
 */
function configure(): void {
  configureDesignToolRuntime({
    projectId: designToolProjectId,
    host: "astro",
    framework: "Astro",
    stylingSystem: detectFramework(tokens).stylingSystem,
    capabilities: { canvas: false, componentSemantics: true },
    tokenCatalog,
    tokens,
    tokenDiagnostics,
    tokenGeneration,
    componentContracts,
  });
}

function createMountElement(): HTMLElement {
  const existing = document.getElementById(DESIGN_TOOL_MOUNT_ID);
  if (existing !== null && existing.isConnected) return existing;
  const mount = existing ?? document.createElement("div");
  mount.id = DESIGN_TOOL_MOUNT_ID;
  document.body.append(mount);
  return mount;
}

configure();
bootstrapDesignTool(createMountElement());
