import { createHash } from "node:crypto";

/**
 * Builds the frozen runtime snapshot served over the loopback manifest
 * transport (ADR-0010).
 *
 * Stage 3 tracer-bullet scope: identity and capabilities travel here; token
 * knowledge arrives in Stage 4 through the same shape, which is why every
 * token field exists now and defaults to empty rather than being omitted.
 */

export interface DesignToolManifestInput {
  /** Absolute project root the dev server is running against. */
  root: string;
}

export interface DesignToolManifest {
  projectId: string;
  host: "nextjs-react";
  framework: "React";
  stylingSystem: string;
  capabilities: { canvas: boolean; componentSemantics: boolean };
  tokenCatalog: readonly unknown[];
  tokens: readonly unknown[];
  tokenDiagnostics: readonly unknown[];
  tokenGeneration: string;
  componentContracts: readonly unknown[];
}

/**
 * Token knowledge produced by the Stage 4 lifecycle. Shape-compatible with
 * the standalone adapter's snapshot so the shared scanner feeds both hosts.
 */
export interface DesignToolTokenSnapshot {
  tokenCatalog: readonly unknown[];
  tokens: readonly unknown[];
  tokenDiagnostics: readonly unknown[];
  tokenGeneration: string;
}

/** Short deterministic digest naming a project across restarts. */
export function nextjsProjectId(root: string): string {
  const digest = createHash("sha256").update(root).digest("hex").slice(0, 12);
  return `nextjs:${digest}`;
}

export function buildManifest(input: DesignToolManifestInput): DesignToolManifest {
  return {
    projectId: nextjsProjectId(input.root),
    host: "nextjs-react",
    framework: "React",
    stylingSystem: "CSS custom properties",
    capabilities: { canvas: false, componentSemantics: true },
    tokenCatalog: [],
    tokens: [],
    tokenDiagnostics: [],
    tokenGeneration: "",
    componentContracts: [],
  };
}
