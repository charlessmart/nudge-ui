import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const outputDirectory = resolve(packageRoot, "dist");
const { version } = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

const shared = { bundle: true, platform: "browser", target: "es2022", logLevel: "warning" };

// Bundles nudge-ui's built output through its package export, so `pnpm build`
// must build nudge-ui first; the workspace dependency orders that.
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
