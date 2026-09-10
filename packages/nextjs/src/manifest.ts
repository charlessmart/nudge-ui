import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import type {
  NudgeUiClientManifest,
  NudgeUiRuntimeConfig,
} from "@nudge-ui/inspector/client-manifest";

/**
 * Builds the frozen runtime snapshot served over the loopback manifest
 * transport (ADR-0010).
 *
 * Stage 3 tracer-bullet scope: identity and capabilities travel here; token
 * knowledge arrives in Stage 4 through the same shape, which is why every
 * token field exists now and defaults to empty rather than being omitted.
 */

export interface NudgeUiManifestInput {
  /** Absolute project root the dev server is running against. */
  root: string;
}

/** Mutable token fields updated by the sidecar after each settled watcher batch. */
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

/**
 * Token knowledge produced by the Stage 4 lifecycle. Shape-compatible with
 * the standalone adapter's snapshot so the shared scanner feeds both hosts.
 */
export interface NudgeUiTokenSnapshot {
  tokenCatalog: NudgeUiRuntimeConfig["tokenCatalog"];
  tokens: NudgeUiRuntimeConfig["tokens"];
  tokenDiagnostics: NudgeUiRuntimeConfig["tokenDiagnostics"];
  tokenGeneration: string;
}

/** Short deterministic digest naming a project across restarts. */
export function nextjsProjectId(root: string): string {
  // Canonicalized so a symlinked working directory hashes to the same
  // project (and therefore the same durable session) as its real path —
  // matching the standalone host's identity derivation.
  let canonical = root;
  try {
    canonical = realpathSync(root);
  } catch {
    /* an unresolvable root keeps its textual form */
  }
  const digest = createHash("sha256").update(canonical).digest("hex").slice(0, 12);
  return `nextjs:${digest}`;
}

export function buildManifest(input: NudgeUiManifestInput): NudgeUiManifest {
  return {
    version: 1,
    revision: 0,
    runtime: {
      projectId: nextjsProjectId(input.root),
      host: "nextjs-react",
      framework: "React",
      stylingSystem: "CSS custom properties",
      // Canvas shares the Vite host's controller/renderer runtime (ADR-0006);
      // the mount in every document bootstraps as a renderer inside cards.
      capabilities: { canvas: true, componentSemantics: true },
      tokenCatalog: [],
      tokens: [],
      tokenDiagnostics: [],
      tokenGeneration: "",
      componentContracts: [],
    },
    reload: {
      endpoint: "/__nudge_ui__/reload",
      strategy: "refresh-manifest",
    },
  };
}
