import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const outputDirectory = resolve(packageRoot, "dist");
const { version } = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));

/** Yields every file under `directory` with its modification time. */
function* files(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* files(path);
    else yield { path, modified: statSync(path).mtimeMs };
  }
}

// The bundle comes from nudge-ui's built output, which this build does not rebuild. Stale output would let extension tests pass against old code.
const nudgeUiRoot = resolve(packageRoot, "../nudge-ui");
const sources = [...files(resolve(nudgeUiRoot, "src"))].filter(({ path }) => !/\.test\.tsx?$/.test(path));
const newestSource = sources.reduce((newest, file) => (file.modified > newest.modified ? file : newest));
const built = [...files(resolve(nudgeUiRoot, "dist"))].filter(({ path }) => path.endsWith(".js"));
const oldestBuild = Math.min(...built.map(({ modified }) => modified));
if (built.length === 0 || newestSource.modified > oldestBuild) {
  throw new Error(
    `nudge-ui's build is older than ${relative(nudgeUiRoot, newestSource.path)}. Run \`pnpm --filter nudge-ui build\` before building the extension.`,
  );
}

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

const shared = { bundle: true, platform: "browser", target: "es2022", logLevel: "warning" };

// Bundles nudge-ui's built output through its package export, so `pnpm build` must build nudge-ui first; the workspace dependency orders that.
await build({
  ...shared,
  entryPoints: [resolve(packageRoot, "src/inspector.ts")],
  outfile: resolve(outputDirectory, "nudge-ui.js"),
  format: "iife",
  define: { "import.meta.env.DEV": "true", "process.env.NODE_ENV": '"production"' },
  loader: { ".svg": "dataurl" },
  minify: true,
});

await build({
  ...shared,
  entryPoints: [resolve(packageRoot, "src/storageBridge.ts")],
  outfile: resolve(outputDirectory, "storage-bridge.js"),
  format: "iife",
});

await build({
  ...shared,
  entryPoints: [resolve(packageRoot, "src/serviceWorker.ts")],
  outfile: resolve(outputDirectory, "service-worker.js"),
  format: "esm",
});

const { cursorImageFiles } = await import("nudge-ui/internal/cursor-images");
const cursorDirectory = resolve(outputDirectory, "cursors");
mkdirSync(cursorDirectory);
for (const [name, svg] of Object.entries(cursorImageFiles())) {
  writeFileSync(resolve(cursorDirectory, `${name}.svg`), svg);
}

cpSync(resolve(packageRoot, "src/icons"), resolve(outputDirectory, "icons"), { recursive: true });

const manifest = JSON.parse(readFileSync(resolve(packageRoot, "src/manifest.json"), "utf8"));
writeFileSync(resolve(outputDirectory, "manifest.json"), `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
