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
 * Astro's structural scoping grammar, declared at the host seam (ADR-0011).
 *
 * Astro compiles component-scoped styles with opaque structural markers:
 * `[data-astro-cid-<hash>]` attribute selectors (attribute strategy) or
 * `.astro-<hash>` classes (class strategy). The `.astro-` prefix is reserved
 * by Astro for class-strategy scoping, so any author class starting with it
 * is treated as structural — documented assumption, not an attempt to
 * hash-match. The inspector strips these markers from human-facing labels
 * only; raw selectors are retained for managed-rule targeting.
 */
const ASTRO_SCOPING_SELECTOR_PATTERN =
  "\\[data-astro-cid-[^\\]]*\\]|\\.astro-[a-zA-Z0-9_-]+";

/**
 * Which identity origins carry exact authored coordinates (ADR-0011 Stage 5).
 *
 * The response identity layer writes exact `data-src` for elements annotated
 * by Astro's compiler (`astro:` cids) and for author-supplied cids on
 * `.astro`/`.html` sources. Hydrated-island JSX keeps line precision: island
 * module positions pass through Astro's dev pipeline before reaching the
 * browser, so columns are not guaranteed to match the authored source.
 */
const ASTRO_SOURCE_COORDINATES = {
  exactCidPrefixes: ["astro:"],
  exactFileExtensions: [".astro", ".html", ".htm"],
} as const;

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
  const existing = document.getElementById(DESIGN_TOOL_MOUNT_ID);
  if (existing !== null && existing.isConnected) return existing;
  const mount = existing ?? document.createElement("div");
  mount.id = DESIGN_TOOL_MOUNT_ID;
  document.body.append(mount);
  return mount;
}

configure();
bootstrapDesignTool(createMountElement());
