import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Framework, PackageManager, ProjectManifest } from "./types.ts";

const nextConfigNames = ["next.config.ts", "next.config.mts", "next.config.mjs", "next.config.js", "next.config.cjs"];
const astroConfigNames = ["astro.config.ts", "astro.config.mts", "astro.config.mjs", "astro.config.js"];
const viteConfigNames = ["vite.config.ts", "vite.config.mts", "vite.config.mjs", "vite.config.js"];

/** Reads only the package metadata needed for framework and package-manager detection. */
export function readProjectManifest(projectRoot: string): ProjectManifest {
  const manifestPath = join(projectRoot, "package.json");
  if (!existsSync(manifestPath)) {
    return { dependencies: new Set() };
  }

  // SAFETY: The object shape is validated before any property is consumed.
  const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as JsonObject;
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`${manifestPath} must contain a JSON object.`);
  }

  return {
    type: stringProperty(parsed, "type"),
    packageManager: stringProperty(parsed, "packageManager"),
    dependencies: new Set([
      ...dependencyNames(parsed, "dependencies"),
      ...dependencyNames(parsed, "devDependencies"),
      ...dependencyNames(parsed, "peerDependencies"),
    ]),
  };
}

/** Detects viable host adapters without treating React or Vite as host frameworks. */
export function detectFrameworks(projectRoot: string, manifest = readProjectManifest(projectRoot)): Framework[] {
  const hasNext = manifest.dependencies.has("next") || hasAnyFile(projectRoot, nextConfigNames);
  const hasAstro = manifest.dependencies.has("astro") || hasAnyFile(projectRoot, astroConfigNames);
  const hosts: Framework[] = [];
  if (hasNext) hosts.push("nextjs");
  if (hasAstro) hosts.push("astro");
  if (hosts.length > 0) return hosts;

  const hasVite = manifest.dependencies.has("vite") || hasAnyFile(projectRoot, viteConfigNames);
  const hasReact = manifest.dependencies.has("react") || manifest.dependencies.has("@vitejs/plugin-react");
  if (hasVite && hasReact) return ["vite-react"];
  if (hasVite) return [];

  if (manifest.dependencies.has("@nudge-ui/standalone") || detectStaticRoot(projectRoot)) return ["standalone"];
  return [];
}

/** Detects the project's package manager, preferring its declared package manager. */
export function detectPackageManager(projectRoot: string, manifest = readProjectManifest(projectRoot)): PackageManager {
  const declared = manifest.packageManager?.split("@")[0];
  if (declared === "pnpm" || declared === "npm" || declared === "yarn" || declared === "bun") return declared;
  let directory = projectRoot;
  while (true) {
    if (existsSync(join(directory, "pnpm-lock.yaml"))) return "pnpm";
    if (existsSync(join(directory, "yarn.lock"))) return "yarn";
    if (existsSync(join(directory, "bun.lock")) || existsSync(join(directory, "bun.lockb"))) return "bun";
    if (existsSync(join(directory, "package-lock.json"))) return "npm";
    const parent = dirname(directory);
    if (parent === directory) break;
    directory = parent;
  }
  return "npm";
}

/** Finds an HTML document root without recursively scanning dependency or build output. */
export function detectStaticRoot(projectRoot: string): string | undefined {
  const entries = readdirSync(projectRoot, { withFileTypes: true });
  if (entries.some((entry) => entry.isFile() && entry.name.endsWith(".html"))) return projectRoot;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith(".") || ignoredStaticDirectories.has(entry.name)) continue;
    const directory = join(projectRoot, entry.name);
    const children = readdirSync(directory, { withFileTypes: true });
    if (children.some((child) => child.isFile() && child.name.endsWith(".html"))) return directory;
  }
  return undefined;
}

export function frameworkDisplayName(framework: Framework): string {
  if (framework === "nextjs") return "Next.js";
  if (framework === "astro") return "Astro";
  if (framework === "vite-react") return "Vite with React";
  return "static HTML";
}

export function adapterPackage(framework: Framework): string {
  if (framework === "nextjs") return "@nudge-ui/nextjs";
  if (framework === "astro") return "@nudge-ui/astro";
  if (framework === "vite-react") return "@nudge-ui/vite-react";
  return "@nudge-ui/standalone";
}

function hasAnyFile(projectRoot: string, names: readonly string[]): boolean {
  return names.some((name) => existsSync(join(projectRoot, name)));
}

const ignoredStaticDirectories = new Set(["node_modules", "dist", "build", "coverage", "test-results"]);

interface JsonObject {
  readonly type?: unknown;
  readonly packageManager?: unknown;
  readonly dependencies?: unknown;
  readonly devDependencies?: unknown;
  readonly peerDependencies?: unknown;
}

function stringProperty(value: JsonObject, key: "type" | "packageManager"): string | undefined {
  const property = key === "type" ? value.type : value.packageManager;
  return typeof property === "string" ? property : undefined;
}

function dependencyNames(
  value: JsonObject,
  key: "dependencies" | "devDependencies" | "peerDependencies",
): string[] {
  const dependencies = key === "dependencies"
    ? value.dependencies
    : key === "devDependencies" ? value.devDependencies : value.peerDependencies;
  if (typeof dependencies !== "object" || dependencies === null || Array.isArray(dependencies)) return [];
  return Object.keys(dependencies);
}
