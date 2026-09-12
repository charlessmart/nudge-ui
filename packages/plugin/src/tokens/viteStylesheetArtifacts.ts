import {
  isAbsolute,
  posix,
  relative,
  resolve,
  sep,
} from "node:path";
import type {
  ArtifactStage,
  StylesheetArtifact,
} from "@nudge-ui/css/token-inventory";
import { detectTailwindV4 } from "../adapters/tailwindV4.ts";
import type { CssImportGraph } from "./activeStylesheets.ts";
import { stripCssQuery } from "./activeStylesheets.ts";

/**
 * Source directories that a Vite host explicitly owns.
 *
 * Vite's resolved root is always included by the adapter. `sourceRoots` lets a
 * monorepo host add authored workspace packages without treating every file
 * reachable through Vite's module graph as application code. Generated roots
 * are excluded even when a caller accidentally includes them in a source
 * root.
 */
export interface ViteSourceScopeOptions {
  readonly sourceRoots?: readonly string[];
  readonly generatedRoots?: readonly string[];
}

const GENERATED_DIRECTORY_NAMES = new Set([
  ".astro",
  ".next",
  ".svelte-kit",
  "build",
  "coverage",
  "dist",
  "out",
  "storybook-static",
]);

/**
 * Project-relative source path for identity and catalog keys.
 *
 * A file outside the project root keeps a `../`-prefixed relative path rather
 * than a machine path, so an authored workspace package stays unique and
 * readable. This matches the Next Adapter's `sourcePath`.
 */
function relativePath(id: string, root?: string): string {
  if (root) {
    const rootPrefix = root.endsWith("/") ? root : `${root}/`;
    if (id.startsWith(rootPrefix)) return id.slice(rootPrefix.length);
    if (id.startsWith("/") && root.startsWith("/")) {
      const relativeId = posix.relative(root, id);
      if (relativeId && relativeId !== ".") return relativeId;
    }
  }
  return id.replace(/^\//, "");
}

export function isHostApplicationSource(
  id: string,
  projectRoot: string | undefined,
  options: ViteSourceScopeOptions = {},
): boolean {
  if (!projectRoot || id.startsWith("\0")) return false;
  const fileId = stripCssQuery(id).replace(/\\/g, "/");
  if (fileId.split("/").includes("node_modules")) {
    return false;
  }
  const absoluteFile = isAbsolute(fileId)
    ? resolve(fileId)
    : resolve(projectRoot, fileId);
  const primaryRoot = resolve(projectRoot);
  const roots = [primaryRoot, ...(options.sourceRoots ?? [])
    .map((sourceRoot) => resolve(projectRoot, sourceRoot))];
  const generatedRoots = (options.generatedRoots ?? [])
    .map((generatedRoot) => resolve(projectRoot, generatedRoot));
  if (isInsideAnyRoot(absoluteFile, generatedRoots)) return false;

  const sourceRoot = roots.find((candidate) => isInsideRoot(absoluteFile, candidate));
  if (!sourceRoot) return false;

  // A generated directory can be nested in an authored workspace package, so a
  // declared source root keeps a conservative name-based guard. The primary
  // root does not: there, a directory named `build` may be ordinary authored
  // source, and the resolved output directory is already excluded above.
  if (sourceRoot !== primaryRoot) {
    const pathSegments = relative(sourceRoot, absoluteFile).split(sep).filter(Boolean);
    if (pathSegments.some((segment) => GENERATED_DIRECTORY_NAMES.has(segment))) {
      return false;
    }
  }

  return true;
}

export function isPackageStylesheet(
  id: string,
  projectRoot: string | undefined,
  options: ViteSourceScopeOptions = {},
): boolean {
  return !isHostApplicationSource(id, projectRoot, options);
}

/** Keep package sources useful to people without serialising machine paths. */
export function catalogSourcePath(
  id: string,
  projectRoot: string | undefined,
  options: ViteSourceScopeOptions = {},
): string {
  const fileId = stripCssQuery(id).replace(/\\/g, "/");
  if (!isPackageStylesheet(fileId, projectRoot, options)) {
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
  readonly sourceRoots?: readonly string[];
  readonly generatedRoots?: readonly string[];
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
  const sourceScope = {
    ...(input.sourceRoots ? { sourceRoots: input.sourceRoots } : {}),
    ...(input.generatedRoots ? { generatedRoots: input.generatedRoots } : {}),
  } satisfies ViteSourceScopeOptions;
  return {
    buildTool: "vite",
    id: catalogSourcePath(fileId, input.projectRoot, sourceScope),
    stage: input.stage,
    provenance: isHostApplicationSource(fileId, input.projectRoot, sourceScope) ? "project" : "package",
    ...(input.order !== undefined ? { order: input.order } : {}),
    ...(input.discoveryOrder !== undefined ? { discoveryOrder: input.discoveryOrder } : {}),
    ...(input.content !== undefined ? {
      content: input.content,
      adapter: (input.tailwindV4 ?? detectTailwindV4(input.content)) ? "tailwind-v4" : undefined,
    } : {}),
    ...(input.failed ? { failed: true } : {}),
  };
}

function isInsideAnyRoot(file: string, roots: readonly string[]): boolean {
  return roots.some((root) => isInsideRoot(file, root));
}

function isInsideRoot(file: string, root: string): boolean {
  const relativeFile = relative(resolve(root), resolve(file));
  return relativeFile !== ""
    && relativeFile !== ".."
    && !relativeFile.startsWith(`..${sep}`)
    && !isAbsolute(relativeFile);
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
