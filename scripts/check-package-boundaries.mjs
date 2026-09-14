#!/usr/bin/env node
// Enforces the boundaries that keep host integrations independent.
//
// A host integrates Nudge UI with exactly one build tool. Hosts may depend on
// shared modules, but never on each other. A sideways edge means reusable
// behaviour is trapped inside a host, so every other host must either copy it
// or take on an unrelated toolchain to reach it.
//
// The hosts used to be separate npm packages, so this rule read dependency
// manifests. They are now directories under one package, which is a finer
// grain: an import is an edge whether or not a manifest records it.
//
// Exceptions are listed in KNOWN_EXCEPTIONS with the work that retires them.
// An exception that no longer matches a real edge fails too, so the list cannot
// outlive the coupling it documents.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const hostsDir = join(repoRoot, "packages", "nudge-ui", "src", "hosts");

const KNOWN_EXCEPTIONS = [
  {
    from: "astro",
    to: "vite",
    reason: "Astro runs on Vite and deliberately composes the Vite integration.",
    retiredBy: "Never — Astro is a Vite host. This edge is the composition, not a leak.",
  },
];

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".mjs", ".cjs"]);
const IGNORED_DIRECTORIES = new Set(["node_modules", "dist", "build", ".next", "test-results"]);

// Matches the specifier in `from "x"`, `import("x")`, and `require("x")`, which
// distinguishes a real edge from a package name mentioned in ordinary data
// (for example Next.js `transpilePackages` lists).
const IMPORT_PATTERN = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;

function listSourceFiles(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (IGNORED_DIRECTORIES.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) listSourceFiles(full, files);
    else if (SOURCE_EXTENSIONS.has(entry.slice(entry.lastIndexOf(".")))) files.push(full);
  }
  return files;
}

const hosts = readdirSync(hostsDir).filter((entry) => statSync(join(hostsDir, entry)).isDirectory());

/** Resolves an import to the host that owns it, or null if it leaves the hosts tree. */
function owningHost(file, specifier) {
  // Published subpaths are how a host addresses another host from the outside.
  const published = /^nudge-ui\/([a-z]+)/.exec(specifier);
  if (published && hosts.includes(published[1])) return published[1];
  if (!specifier.startsWith(".")) return null;

  const target = resolve(dirname(file), specifier);
  const withinHosts = relative(hostsDir, target);
  if (withinHosts.startsWith("..")) return null;
  const [host] = withinHosts.split("/");
  return hosts.includes(host) ? host : null;
}

const edges = [];
for (const host of hosts) {
  for (const file of listSourceFiles(join(hostsDir, host))) {
    const contents = readFileSync(file, "utf8");
    for (const [, specifier] of contents.matchAll(IMPORT_PATTERN)) {
      const owner = owningHost(file, specifier);
      if (owner && owner !== host) {
        edges.push({ from: host, to: owner, where: file.slice(repoRoot.length), detail: specifier });
      }
    }
  }
}

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
    `\nHost boundaries FAILED: ${violations.length} violation(s), ` +
      `${staleExceptions.length} stale exception(s).`,
  );
  process.exit(1);
}

console.log(
  `Host boundaries OK across ${hosts.length} host(s): no sideways edges beyond ` +
    `${KNOWN_EXCEPTIONS.length} documented exception(s) (${edges.length} edge(s) matched).`,
);
