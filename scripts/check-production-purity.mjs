#!/usr/bin/env node
// Proves ADR-0002 for every host: a production build carries no inspector
// bootstrap, no identity attributes, and no token transport. Browser-free by
// design — each host emits a build tree to grep, except the static-HTML host,
// which has no build step and must instead leave the author's files unchanged.
//
// Usage: node scripts/check-production-purity.mjs [host...]

import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));

// Runtime artifacts only Nudge UI emits. A bare "@nudge-ui/" reference is
// deliberately not one: package names appear legitimately in fixture copy and
// build traces, so they only add false positives.
const FORBIDDEN_MARKERS = [
  "data-cid=",
  "data-src=",
  "data-cprops=",
  "nudge-ui-root",
  "__nudgeUi",
  "NudgeUiMount",
  "__NudgeUiCreateElement",
  "__nudge_ui__",
  "virtual:design-tokens",
];

const SCANNABLE = /\.(js|mjs|cjs|html|css|rsc|json|txt|map)$/;

const HOSTS = {
  vite: {
    label: "Vite + React",
    directory: "examples/sandbox",
    build: ["pnpm", ["exec", "vite", "build"]],
    outputs: ["dist"],
  },
  astro: {
    label: "Astro",
    directory: "examples/sandbox-astro",
    build: ["pnpm", ["exec", "astro", "build"]],
    outputs: ["dist"],
  },
  next: {
    label: "Next.js",
    directory: "examples/sandbox-next",
    build: ["pnpm", ["exec", "next", "build"]],
    outputs: [".next/static", ".next/server", ".next/standalone"],
  },
  standalone: {
    label: "Static HTML",
    directory: "examples/standalone-html",
    servedPurity: true,
  },
};

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} ${args.join(" ")} exited ${code}`)),
    );
  });
}

function walk(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files; // an output tree this build flavour did not produce
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, files);
    else if (SCANNABLE.test(entry)) files.push(full);
  }
  return files;
}

function scanBuildOutput(host) {
  const violations = [];
  let scanned = 0;

  for (const output of host.outputs) {
    for (const file of walk(join(repoRoot, host.directory, output))) {
      scanned += 1;
      const contents = readFileSync(file, "utf8");
      for (const marker of FORBIDDEN_MARKERS) {
        if (contents.includes(marker)) {
          violations.push(`${file.slice(repoRoot.length)} contains ${JSON.stringify(marker)}`);
        }
      }
    }
  }

  if (scanned === 0) throw new Error(`${host.label}: build produced no scannable output.`);
  return { scanned, violations };
}

function hashTree(dir) {
  const hashes = new Map();
  for (const file of walk(dir, [])) {
    hashes.set(file.slice(dir.length), createHash("sha256").update(readFileSync(file)).digest("hex"));
  }
  return hashes;
}

async function waitForServer(url, timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(`Server at ${url} did not become ready.`);
}

// This host instruments responses in memory, so its guarantee is that serving never edits files on disk.
async function checkServedPurity(host) {
  const source = join(repoRoot, host.directory, "prototype");
  const root = mkdtempSync(join(tmpdir(), "nudge-ui-standalone-e2e-"));
  const cli = join(repoRoot, "packages/nudge-ui/bin/nudge-ui.mjs");
  const port = 4399;

  cpSync(source, root, { recursive: true });
  const before = hashTree(root);

  const server = spawn(
    process.execPath,
    [cli, "serve", root, "--host", "127.0.0.1", "--port", String(port)],
    { stdio: "ignore" },
  );

  try {
    await waitForServer(`http://127.0.0.1:${port}/index.html`);

    const pages = ["/index.html", "/second.html"];
    const served = await Promise.all(
      pages.map(async (page) => (await fetch(`http://127.0.0.1:${port}${page}`)).text()),
    );

    const violations = [];

    // Development must inject, or the on-disk comparison below proves nothing.
    for (const [index, html] of served.entries()) {
      if (!html.includes("data-cid=")) {
        violations.push(`${pages[index]} was served without identity attributes.`);
      }
    }

    const after = hashTree(root);
    for (const [file, hash] of before) {
      if (after.get(file) !== hash) violations.push(`serving modified ${file} on disk.`);
    }

    return { scanned: before.size, violations };
  } finally {
    server.kill("SIGTERM");
    rmSync(root, { recursive: true, force: true });
  }
}

const requested = process.argv.slice(2);
const selected = requested.length > 0 ? requested : Object.keys(HOSTS);

let failed = false;

for (const name of selected) {
  const host = HOSTS[name];
  if (!host) {
    console.error(`Unknown host ${JSON.stringify(name)}. Known: ${Object.keys(HOSTS).join(", ")}`);
    process.exit(2);
  }

  console.log(`\n=== ${host.label} (${name}) ===`);

  let result;
  if (host.servedPurity) {
    result = await checkServedPurity(host);
  } else {
    await run(host.build[0], host.build[1], join(repoRoot, host.directory));
    result = scanBuildOutput(host);
  }

  for (const violation of result.violations) console.error(`VIOLATION ${violation}`);

  if (result.violations.length > 0) {
    failed = true;
    console.error(`${host.label} FAILED: ${result.violations.length} violation(s).`);
  } else {
    console.log(`${host.label} OK: ${result.scanned} file(s) clean.`);
  }
}

if (failed) {
  console.error("\nProduction purity FAILED.");
  process.exit(1);
}
console.log("\nProduction purity OK for every checked host.");
