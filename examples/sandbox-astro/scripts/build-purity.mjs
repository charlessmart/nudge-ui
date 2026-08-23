// Production-purity gate for the Astro fixture (ADR-0002 / ADR-0011).
//
// Runs a real `astro build` and fails if ANY emitted file carries Design Tool
// artifacts: identity attributes, the inspector mount, or any @design-tool
// runtime reference. Exit code is the API.
import { execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const FORBIDDEN = [
  // Covers both the response-level layer (`data-cid="astro:…"`) and the
  // island JSX transform's injections; the fixture never writes these itself.
  "data-cid",
  "design-tool-root",
  "@design-tool/",
  "__designTool",
];

function walk(dir, files = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

execSync("pnpm exec astro build", { stdio: "inherit", cwd: new URL("..", import.meta.url).pathname });

const distDir = new URL("./dist/", import.meta.url).pathname;
let violations = 0;
for (const file of walk(distDir)) {
  let content;
  try {
    content = readFileSync(file, "utf8");
  } catch {
    continue; // binary assets
  }
  for (const needle of FORBIDDEN) {
    if (content.includes(needle)) {
      console.error(`VIOLATION ${file}: contains ${JSON.stringify(needle)}`);
      violations += 1;
    }
  }
}

if (violations > 0) {
  console.error(`\nBuild purity FAILED: ${violations} violation(s).`);
  process.exit(1);
}
console.log("\nBuild purity OK: no Design Tool artifacts in astro build output.");
