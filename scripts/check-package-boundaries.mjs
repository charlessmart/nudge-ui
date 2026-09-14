#!/usr/bin/env node
// Enforces the package-role boundaries that keep host adapters independent.
//
// A host adapter integrates Nudge UI with exactly one build tool. Host adapters
// may depend on shared packages, but never on each other. A sideways edge means
// reusable behaviour is trapped inside a host, so every other host must either
// copy it or take on an unrelated toolchain to reach it.
//
// Exceptions are listed in KNOWN_EXCEPTIONS with the work that retires them.
// An exception that no longer matches a real edge fails too, so the list cannot
// outlive the coupling it documents.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const packagesDir = join(repoRoot, "packages");

/** Packages that adapt Nudge UI to one build tool. */
const HOST_PACKAGES = new Set([
  "@nudge-ui/vite-react",
  "@nudge-ui/nextjs",
  "@nudge-ui/astro",
  "@nudge-ui/standalone",
]);

const KNOWN_EXCEPTIONS = [
  {
    from: "@nudge-ui/astro",
    to: "@nudge-ui/vite-react",
    reason: "Astro runs on Vite and deliberately composes the Vite integration.",
    retiredBy: "Step 5 — split the Vite host module out of the React semantics module.",
  },
];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"]);
const IGNORED_DIRECTORIES = new Set(["node_modules", "dist", "build", ".next", "test-results"]);

// Matches the specifier in `from "x"`, `import("x")`, and `require("x")`, which
// distinguishes a real edge from a package name mentioned in ordinary data
// (for example Next.js `transpilePackages` lists).
const IMPORT_PATTERN = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function listSourceFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRECTORIES.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) listSourceFiles(full, files);
    else if (SOURCE_EXTENSIONS.has(entry.slice(entry.lastIndexOf(".")))) files.push(full);
  }
  return files;
}

/** Resolves an import specifier to the workspace package that owns it. */
function owningPackage(specifier) {
  const parts = specifier.split("/");
  const name = specifier.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0];
  return HOST_PACKAGES.has(name) ? name : null;
}

function collectEdges() {
  const edges = [];

  for (const entry of readdirSync(packagesDir)) {
    const packageDir = join(packagesDir, entry);
    if (!statSync(packageDir).isDirectory()) continue;

    const manifest = readJson(join(packageDir, "package.json"));
    if (!HOST_PACKAGES.has(manifest.name)) continue;

    for (const field of ["dependencies", "peerDependencies"]) {
      for (const dependency of Object.keys(manifest[field] ?? {})) {
        if (HOST_PACKAGES.has(dependency) && dependency !== manifest.name) {
          edges.push({
            from: manifest.name,
            to: dependency,
            where: `packages/${entry}/package.json`,
            detail: `${field}.${dependency}`,
          });
        }
      }
    }

    for (const file of listSourceFiles(packageDir)) {
      const contents = readFileSync(file, "utf8");
      for (const [, specifier] of contents.matchAll(IMPORT_PATTERN)) {
        const owner = owningPackage(specifier);
        if (owner && owner !== manifest.name) {
          edges.push({
            from: manifest.name,
            to: owner,
            where: file.slice(repoRoot.length),
            detail: specifier,
          });
        }
      }
    }
  }

  return edges;
}

const edges = collectEdges();
const matchesEdge = (exception, edge) => exception.from === edge.from && exception.to === edge.to;

const violations = edges.filter((edge) => !KNOWN_EXCEPTIONS.some((e) => matchesEdge(e, edge)));
const staleExceptions = KNOWN_EXCEPTIONS.filter((e) => !edges.some((edge) => matchesEdge(e, edge)));

for (const violation of violations) {
  console.error(
    `VIOLATION ${violation.from} -> ${violation.to}\n` +
      `  at ${violation.where} (${violation.detail})`,
  );
}

for (const exception of staleExceptions) {
  console.error(
    `STALE EXCEPTION ${exception.from} -> ${exception.to}\n` +
      `  The coupling is gone. Delete this entry from KNOWN_EXCEPTIONS.`,
  );
}

if (violations.length > 0 || staleExceptions.length > 0) {
  console.error(
    `\nPackage boundaries FAILED: ${violations.length} violation(s), ` +
      `${staleExceptions.length} stale exception(s).`,
  );
  process.exit(1);
}

const allowed = edges.length;
console.log(
  `Package boundaries OK: no host-to-host edges beyond ` +
    `${KNOWN_EXCEPTIONS.length} documented exception(s) (${allowed} edge(s) matched).`,
);
