/** Directory order is discovery evidence only; a walk cannot prove the order a browser applies stylesheets. */
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
} from "../css/token-inventory/index.ts";
import {
  detectStylesheetDialects,
  dialectsInUse,
  interpretDialects,
  observedDialects,
  type DialectName,
} from "../css/dialects/index.ts";
import { isExcludedDirectoryName, isSensitiveProjectPath } from "./pathPolicy.ts";
import type {
  TokenCatalogDiagnostic,
  TokenDeclaration,
  TokenDefinition,
  TokenEntry,
} from "../css/model/index.ts";

export interface ProjectTokenSnapshot {
  readonly tokenCatalog: readonly TokenDefinition[];
  readonly tokens: readonly TokenEntry[];
  readonly tokenDiagnostics: readonly TokenCatalogDiagnostic[];
  readonly tokenGeneration: string;
  readonly stylingDialects: readonly DialectName[];
}

export const EMPTY_PROJECT_TOKEN_SNAPSHOT: ProjectTokenSnapshot = {
  tokenCatalog: [],
  tokens: [],
  tokenDiagnostics: [],
  tokenGeneration: "empty",
  stylingDialects: [],
};

export interface ProjectCssArtifact {
  readonly absolutePath: string;
  readonly projectPath: string;
  readonly content?: string;
  readonly readError?: string;
}

export type ProjectCssFileReader = (absolutePath: string) => string | Promise<string>;

export interface ProjectTokenSnapshotOptions {
  readonly rootDirectory: string;
  readonly additionalRootDirectories?: readonly string[];
  readonly readFile?: ProjectCssFileReader;
  /** Prefixed to the digest so two hosts scanning one project publish distinct generations. */
  readonly generationLabel: string;
}

/** Sorted by project-relative POSIX path; symlinks only within root; read failures become diagnostics, never rejections. */
export async function createProjectTokenSnapshot(
  options: ProjectTokenSnapshotOptions,
): Promise<ProjectTokenSnapshot> {
  const rootDirectory = await canonicalRoot(options.rootDirectory);
  const additionalRoots = (await Promise.all(
    (options.additionalRootDirectories ?? []).map((directory) => canonicalOptionalRoot(directory)),
  )).filter((root): root is string => root !== null);
  const scanRoots = [rootDirectory, ...additionalRoots.filter((root) => root !== rootDirectory)];
  const discovered = await Promise.all(
    scanRoots.map((root) => discoverProjectCssArtifacts(root, options.readFile)),
  );
  const canonicalPaths = await Promise.all(discovered.map((rootArtifacts) => Promise.all(
    rootArtifacts.map((artifact) => realpath(artifact.absolutePath).catch(() => artifact.absolutePath)),
  )));
  const artifacts: ProjectCssArtifact[] = [];
  const seenFiles = new Set<string>();
  for (let index = 0; index < discovered.length; index += 1) {
    for (const [artifactIndex, artifact] of (discovered[index] ?? []).entries()) {
      const canonicalPath = canonicalPaths[index]?.[artifactIndex] ?? artifact.absolutePath;
      if (seenFiles.has(canonicalPath)) continue;
      seenFiles.add(canonicalPath);
      // Additional roots are expressed relative to the primary so one inventory keeps provenance.
      artifacts.push({
        ...artifact,
        projectPath: index === 0
          ? artifact.projectPath
          : relative(rootDirectory, artifact.absolutePath).split(sep).join("/"),
      });
    }
  }
  artifacts.sort((a, b) => comparePosixStrings(a.projectPath, b.projectPath));
  const inventory = createTokenInventory();
  const detected = new Set<DialectName>();

  for (const [discoveryOrder, artifact] of artifacts.entries()) {
    const dialects = artifact.content === undefined ? [] : detectStylesheetDialects(artifact.content);
    for (const dialect of dialects) detected.add(dialect);
    const inventoryArtifact: StylesheetArtifact = {
      buildTool: "static-html",
      id: artifact.projectPath,
      stage: "authored",
      provenance: "project",
      discoveryOrder,
      ...(artifact.content !== undefined ? { content: artifact.content } : {}),
      // Labelled as the Vite host labels it, so the relabelling below reaches the same rows.
      ...(dialects.includes("tailwind-v4") ? { adapter: "tailwind-v4" } : {}),
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

  // Without a module graph only stylesheet evidence is available: no Tailwind v3 config or vanilla-extract contract.
  const interpretation = interpretDialects({
    tailwindV3Css: detected.has("tailwind-v3"),
    tailwindV4Css: detected.has("tailwind-v4"),
  });
  if (detected.size > 0) {
    for (const contribution of interpretation.contributions) inventory.applyContribution(contribution);
  }

  const snapshot = inventory.snapshot();
  const tokenGeneration = artifacts.length === 0
    ? "empty"
    : deterministicGeneration(artifacts, snapshot.generation, options.generationLabel);
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
    stylingDialects: dialectsInUse(snapshot.tokens, observedDialects(interpretation)),
  };
}

/** Exported for tests: provenance and symlink confinement without PostCSS. */
export async function discoverProjectCssArtifacts(
  rootDirectory: string,
  readFile: ProjectCssFileReader = (absolutePath) => readUtf8File(absolutePath, "utf8"),
): Promise<readonly ProjectCssArtifact[]> {
  const root = await canonicalRoot(rootDirectory);
  const artifacts: ProjectCssArtifact[] = [];
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
  artifacts: ProjectCssArtifact[],
  readFile: ProjectCssFileReader,
): Promise<void> {
  const canonicalDirectoryPath = await canonicalWithinRoot(rootDirectory, directory);
  if (!canonicalDirectoryPath || visitedDirectories.has(canonicalDirectoryPath)) return;
  const projectDirectoryPath = relative(rootDirectory, directory).split(sep).join("/");
  const canonicalProjectDirectoryPath = relative(rootDirectory, canonicalDirectoryPath)
    .split(sep)
    .join("/");
  if (isSensitiveProjectPath(projectDirectoryPath)
    || isSensitiveProjectPath(canonicalProjectDirectoryPath)) return;
  visitedDirectories.add(canonicalDirectoryPath);

  let entries: Dirent[];
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  entries.sort((a, b) => comparePosixStrings(a.name, b.name));

  // Probes and reads never change a traversal decision, so they run concurrently; the decisions below keep name order.
  const probes = await Promise.all(entries.map(async (entry) => {
    if (entry.isDirectory() && isExcludedDirectoryName(entry.name)) return null;
    const absolutePath = join(directory, entry.name);
    const [canonicalPath, stats] = await Promise.all([
      canonicalWithinRoot(rootDirectory, absolutePath),
      stat(absolutePath).catch(() => null),
    ]);
    return canonicalPath && stats ? { entry, absolutePath, canonicalPath, stats } : null;
  }));

  const reads: Array<Promise<void>> = [];
  for (const probe of probes) {
    if (!probe) continue;
    const { entry, absolutePath, canonicalPath, stats } = probe;

    if (stats.isDirectory()) {
      if (isExcludedDirectoryName(entry.name)) continue;
      // Sequential, so a directory reached through two links keeps the provenance a depth-first walk gives it.
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
    const canonicalProjectPath = relative(rootDirectory, canonicalPath).split(sep).join("/");
    if (isSensitiveProjectPath(projectPath) || isSensitiveProjectPath(canonicalProjectPath)) {
      continue;
    }
    reads.push(readArtifact(absolutePath, projectPath, readFile).then((artifact) => {
      artifacts.push(artifact);
    }));
  }
  await Promise.all(reads);
}

/** Never rejects: a reader that throws, synchronously or not, becomes a read error. */
async function readArtifact(
  absolutePath: string,
  projectPath: string,
  readFile: ProjectCssFileReader,
): Promise<ProjectCssArtifact> {
  try {
    return { absolutePath, projectPath, content: await readFile(absolutePath) };
  } catch (error) {
    return { absolutePath, projectPath, readError: readErrorMessage(error) };
  }
}

async function canonicalRoot(rootDirectory: string): Promise<string> {
  const root = await realpath(resolve(rootDirectory));
  if (!(await stat(root)).isDirectory()) {
    throw new Error(`Standalone root is not a directory: ${rootDirectory}`);
  }
  return root;
}

async function canonicalOptionalRoot(rootDirectory: string): Promise<string | null> {
  try {
    return await canonicalRoot(rootDirectory);
  } catch {
    return null;
  }
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
    // A disappearing file is absent from this scan; read failures are handled above.
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
  artifacts: readonly ProjectCssArtifact[],
  inventoryGeneration: string,
  label: string,
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
  return `${label}:${digest}`;
}

/** Compares UTF-8 path bytes so discovery is independent of the host locale. */
function comparePosixStrings(a: string, b: string): number {
  return Buffer.from(a, "utf8").compare(Buffer.from(b, "utf8"));
}
