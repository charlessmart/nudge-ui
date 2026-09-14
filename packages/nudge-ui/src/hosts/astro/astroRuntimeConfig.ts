import {
  detectStylingSystem,
  type NudgeUiRuntimeConfig,
} from "../../inspector/clientManifest.ts";

interface AstroRuntimeKnowledge {
  readonly projectId: string;
  readonly tokenCatalog: NudgeUiRuntimeConfig["tokenCatalog"];
  readonly tokens: NudgeUiRuntimeConfig["tokens"];
  readonly tokenDiagnostics: NudgeUiRuntimeConfig["tokenDiagnostics"];
  readonly tokenGeneration: string;
  readonly componentContracts: NudgeUiRuntimeConfig["componentContracts"];
}

const ASTRO_SCOPING_SELECTOR_PATTERN =
  "\\[data-astro-cid-[^\\]]*\\]|\\.astro-[a-zA-Z0-9_-]+";
const ASTRO_SOURCE_COORDINATES = {
  exactCidPrefixes: ["astro:"],
  exactFileExtensions: [".astro", ".html", ".htm"],
} as const;

/** Builds the runtime knowledge shared by both Astro client transports. */
export function createAstroRuntimeConfig(
  knowledge: AstroRuntimeKnowledge,
): NudgeUiRuntimeConfig {
  return {
    projectId: knowledge.projectId,
    host: "astro",
    framework: "Astro",
    stylingSystem: detectStylingSystem(knowledge.tokens),
    capabilities: {
      canvas: false,
      componentSemantics: true,
      sourceCoordinates: ASTRO_SOURCE_COORDINATES,
      scopingSelectorPattern: ASTRO_SCOPING_SELECTOR_PATTERN,
    },
    tokenCatalog: knowledge.tokenCatalog,
    tokens: knowledge.tokens,
    tokenDiagnostics: knowledge.tokenDiagnostics,
    tokenGeneration: knowledge.tokenGeneration,
    componentContracts: knowledge.componentContracts,
  };
}
