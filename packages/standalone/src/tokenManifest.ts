/**
 * Node-only CSS token discovery for the standalone static HTML Adapter.
 *
 * The scanner deliberately reports directory order as discovery evidence.
 * It never supplies stylesheet order because a directory walk cannot prove
 * the order in which a browser imports or applies stylesheets.
 *
 * Every filesystem operation is asynchronous so a large prototype tree never
 * blocks the server's event loop while browser clients hold open connections.
 */
import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";
import {
  readFile as readUtf8File,
  readdir,
  realpath,
  stat,
} from "node:fs/promises";
import { extname, isAbsolute, join, relative, resolve, sep } from "node:path";
import {
  createTokenInventory,
  type InventoryDiagnostic,
  type StylesheetArtifact,
} from "@design-tool/css/token-inventory";
import type {
  TokenCatalogDiagnostic,
  TokenDeclaration,
  TokenDefinition,
  TokenEntry,
} from "@design-tool/css/model";

const EXCLUDED_DIRECTORY_NAMES = new Set([
  ".git",
  ".next",
  "build",
  "dist",
  "node_modules",
]);

/** The serializable token knowledge published by the standalone manifest. */
export interface StandaloneTokenSnapshot {
  readonly tokenCatalog: readonly TokenDefinition[];
  readonly tokens: readonly TokenEntry[];
  readonly tokenDiagnostics: readonly TokenCatalogDiagnostic[];
  readonly tokenGeneration: string;
}

/** The placeholder used before and in place of a successful project scan. */
export const EMPTY_STANDALONE_TOKEN_SNAPSHOT: StandaloneTokenSnapshot = {
  tokenCatalog: [],
  tokens: [],
  tokenDiagnostics: [],
  tokenGeneration: "empty",
};

/** A CSS file discovered below the project root before inventory parsing. */
export interface StandaloneCssArtifact {
  readonly absolutePath: string;
  readonly projectPath: string;
  readonly content?: string;
  readonly readError?: string;
}

/**
 * Injectable file reader used to keep unreadable-file handling testable.
 * Readers may resolve asynchronously; the scan awaits each result.
 */
export type StandaloneCssFileReader = (absolutePath: string) => string | Promise<string>;

/** Options for the deterministic project CSS scan. */
export interface StandaloneTokenManifestOptions {
  readonly rootDirectory: string;
  readonly readFile?: StandaloneCssFileReader;
}

/**
 * Discovers ordinary project CSS and builds a complete token snapshot.
 *
 * CSS files are identified by project-relative POSIX paths and sorted before
 * receiving discoveryOrder. Symlinked files and directories are followed
 * only when their canonical target remains below rootDirectory. Read and
 * parse failures become diagnostics; they never reject the scan.
 */
export async function createStandaloneTokenSnapshot(
  options: StandaloneTokenManifestOptions,
): Promise<StandaloneTokenSnapshot> {
  const rootDirectory = await canonicalRoot(options.rootDirectory);
  const artifacts = await discoverStandaloneCssArtifacts(rootDirectory, options.readFile);
  const inventory = createTokenInventory();

  for (const [discoveryOrder, artifact] of artifacts.entries()) {
    const inventoryArtifact: StylesheetArtifact = {
      buildTool: "static-html",
      id: artifact.projectPath,
      stage: "authored",
      provenance: "project",
      discoveryOrder,
      ...(artifact.content !== undefined ? { content: artifact.content } : {}),
      ...(artifact.readError ? {
        diagnostics: [{
          code: "stylesheet-unreadable",
          message: `Stylesheet "${artifact.projectPath}" could not be read: ${artifact.readError}`,
          module: artifact.projectPath,
        }],
      } : {}),
    };
    inventory.apply(inventoryArtifact);
  }

  const snapshot = inventory.snapshot();
  const tokenGeneration = artifacts.length === 0
    ? "empty"
    : deterministicGeneration(artifacts, snapshot.generation);
  return {
    tokenCatalog: snapshot.definitions.map((definition): TokenDefinition => ({
      ...definition,
      declarations: definition.declarations.map((declaration): TokenDeclaration => ({
        id: declaration.id,
        order: declaration.order,
        value: declaration.value,
        source: declaration.source,
        important: declaration.important,
        context: declaration.context,
      })),
    })),
    tokens: snapshot.tokens,
    tokenDiagnostics: snapshot.diagnostics.map(mapDiagnostic),
    tokenGeneration,
  };
}

/**
 * Returns every ordinary CSS file below rootDirectory in stable path order.
 * This is exported as a discovery seam so callers can test provenance and
 * symlink confinement without depending on PostCSS or inventory internals.
 */
export async function discoverStandaloneCssArtifacts(
  rootDirectory: string,
  readFile: StandaloneCssFileReader = (absolutePath) => readUtf8File(absolutePath, "utf8"),
): Promise<readonly StandaloneCssArtifact[]> {
  const root = await canonicalRoot(rootDirectory);
  const artifacts: StandaloneCssArtifact[] = [];
  const visitedDirectories = new Set<string>();
  const visitedFiles = new Set<string>();

  await walkDirectory(root, root, visitedDirectories, visitedFiles, artifacts, readFile);
  artifacts.sort((a, b) => comparePosixStrings(a.projectPath, b.projectPath));
  return artifacts;
}

async function walkDirectory(
  rootDirectory: string,
  directory: string,
  visitedDirectories: Set<string>,
  visitedFiles: Set<string>,
  artifacts: StandaloneCssArtifact[],
  readFile: StandaloneCssFileReader,
): Promise<void> {
  const canonicalDirectoryPath = await canonicalWithinRoot(rootDirectory, directory);
  if (!canonicalDirectoryPath || visitedDirectories.has(canonicalDirectoryPath)) return;
  visitedDirectories.add(canonicalDirectoryPath);

  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => comparePosixStrings(a.name, b.name));

  for (const entry of entries) {
    if (entry.isDirectory() && EXCLUDED_DIRECTORY_NAMES.has(entry.name)) continue;
    const absolutePath = join(directory, entry.name);
    const canonicalPath = await canonicalWithinRoot(rootDirectory, absolutePath);
    if (!canonicalPath) continue;

    let stats: Awaited<ReturnType<typeof stat>>;
    try {
      stats = await stat(absolutePath);
    } catch {
      continue;
    }

    if (stats.isDirectory()) {
      if (EXCLUDED_DIRECTORY_NAMES.has(entry.name)) continue;
      await walkDirectory(
        rootDirectory,
        absolutePath,
        visitedDirectories,
        visitedFiles,
        artifacts,
        readFile,
      );
      continue;
    }
    if (!stats.isFile() || extname(entry.name).toLowerCase() !== ".css") continue;
    if (visitedFiles.has(canonicalPath)) continue;
    visitedFiles.add(canonicalPath);

    const projectPath = relative(rootDirectory, absolutePath).split(sep).join("/");
    try {
      const content = await readFile(absolutePath);
      artifacts.push({ absolutePath, projectPath, content });
    } catch (error) {
      artifacts.push({
        absolutePath,
        projectPath,
        readError: readErrorMessage(error),
      });
    }
  }
}

async function canonicalRoot(rootDirectory: string): Promise<string> {
  const root = await realpath(resolve(rootDirectory));
  if (!(await stat(root)).isDirectory()) {
    throw new Error(`Standalone root is not a directory: ${rootDirectory}`);
  }
  return root;
}

async function canonicalWithinRoot(
  rootDirectory: string,
  candidate: string,
): Promise<string | null> {
  try {
    const canonical = await realpath(candidate);
    const pathFromRoot = relative(rootDirectory, canonical);
    if (pathFromRoot === ""
      || (!pathFromRoot.startsWith(`..${sep}`)
        && pathFromRoot !== ".."
        && !isAbsolute(pathFromRoot))) {
      return canonical;
    }
  } catch {
    // A disappearing file is simply absent from this scan. Read failures for
    // existing CSS are reported by the file-reader branch above.
  }
  return null;
}

function readErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  return "read failed";
}

function mapDiagnostic(diagnostic: InventoryDiagnostic): TokenCatalogDiagnostic {
  return {
    code: diagnostic.code,
    message: diagnostic.message,
    module: diagnostic.module ?? diagnostic.artifact ?? "standalone-css",
    ...(diagnostic.exportName !== undefined ? { exportName: diagnostic.exportName } : {}),
  };
}

function deterministicGeneration(
  artifacts: readonly StandaloneCssArtifact[],
  inventoryGeneration: string,
): string {
  const facts = artifacts.map((artifact) => JSON.stringify({
    path: artifact.projectPath,
    content: artifact.content,
    readError: artifact.readError,
  }));
  const digest = createHash("sha256")
    .update(`${facts.join("\n")}\n${inventoryGeneration}`)
    .digest("hex")
    .slice(0, 24);
  return `static-html:${digest}`;
}

/** Compares UTF-8 path bytes so discovery is independent of the host locale. */
function comparePosixStrings(a: string, b: string): number {
  return Buffer.from(a, "utf8").compare(Buffer.from(b, "utf8"));
}
