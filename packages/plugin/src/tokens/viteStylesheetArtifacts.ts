import {
  isAbsolute,
  relative,
  resolve,
  sep,
} from "node:path";
import type {
  ArtifactStage,
  StylesheetArtifact,
} from "@design-tool/css/token-inventory";
import { detectTailwindV4 } from "../adapters/tailwindV4.ts";
import type { CssImportGraph } from "./activeStylesheets.ts";
import { stripCssQuery } from "./activeStylesheets.ts";

function relativePath(id: string, root?: string): string {
  if (root) {
    const rootPrefix = root.endsWith("/") ? root : `${root}/`;
    if (id.startsWith(rootPrefix)) return id.slice(rootPrefix.length);
  }
  return id.replace(/^\//, "");
}

export function isHostApplicationSource(
  id: string,
  projectRoot: string | undefined,
): boolean {
  if (!projectRoot || id.startsWith("\0")) return false;
  const fileId = stripCssQuery(id);
  if (fileId.includes("/node_modules/") || fileId.includes("\\node_modules\\")) {
    return false;
  }
  const absoluteFile = isAbsolute(fileId)
    ? resolve(fileId)
    : resolve(projectRoot, fileId);
  const relativeFile = relative(resolve(projectRoot), absoluteFile);
  return relativeFile !== ""
    && relativeFile !== ".."
    && !relativeFile.startsWith(`..${sep}`)
    && !isAbsolute(relativeFile);
}

export function isPackageStylesheet(
  id: string,
  projectRoot: string | undefined,
): boolean {
  return !isHostApplicationSource(id, projectRoot);
}

/** Keep package sources useful to people without serialising machine paths. */
export function catalogSourcePath(
  id: string,
  projectRoot: string | undefined,
): string {
  const fileId = stripCssQuery(id).replace(/\\/g, "/");
  if (!isPackageStylesheet(fileId, projectRoot)) {
    return relativePath(fileId, projectRoot);
  }
  const nodeModules = fileId.lastIndexOf("/node_modules/");
  if (nodeModules >= 0) return fileId.slice(nodeModules + "/node_modules/".length);
  if (projectRoot) return relative(projectRoot, fileId).replace(/\\/g, "/");
  return fileId.replace(/^\//, "");
}

export interface ViteStylesheetArtifactInput {
  readonly id: string;
  readonly projectRoot: string | undefined;
  readonly stage: ArtifactStage;
  readonly content?: string;
  readonly failed?: boolean;
  readonly order?: number;
  readonly discoveryOrder?: number;
  /** Explicit graph-level v4 detection avoids mistaking Tailwind v3 --tw helpers for v4. */
  readonly tailwindV4?: boolean;
}

/** Map Vite-specific identity and evidence into the neutral artifact contract. */
export function createViteStylesheetArtifact(
  input: ViteStylesheetArtifactInput,
): StylesheetArtifact {
  const fileId = stripCssQuery(input.id);
  return {
    buildTool: "vite",
    id: catalogSourcePath(fileId, input.projectRoot),
    stage: input.stage,
    provenance: isHostApplicationSource(fileId, input.projectRoot) ? "project" : "package",
    ...(input.order !== undefined ? { order: input.order } : {}),
    ...(input.discoveryOrder !== undefined ? { discoveryOrder: input.discoveryOrder } : {}),
    ...(input.content !== undefined ? {
      content: input.content,
      adapter: (input.tailwindV4 ?? detectTailwindV4(input.content)) ? "tailwind-v4" : undefined,
    } : {}),
    ...(input.failed ? { failed: true } : {}),
  };
}

export interface OrderedViteStylesheet {
  readonly id: string;
  readonly code: string;
  readonly order?: number;
  readonly discoveryOrder?: number;
}

/**
 * A single active root proves nested CSS import order. Multiple independent
 * roots have no proven cross-root cascade order, so their traversal rank stays
 * discovery evidence.
 */
export function orderViteStylesheetGraph(
  graph: CssImportGraph,
  activeRootCount: number,
): OrderedViteStylesheet[] {
  const authoritative = activeRootCount === 1;
  return graph.order.map((id, index) => ({
    id,
    code: graph.files.get(id)!,
    ...(authoritative ? { order: index } : { discoveryOrder: index }),
  }));
}
