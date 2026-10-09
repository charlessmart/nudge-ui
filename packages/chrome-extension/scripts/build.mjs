import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { clientBuildOptions } from "../../../scripts/build-browser-client.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const outputDirectory = resolve(packageRoot, "dist");
const { version } = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));

rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });

// The extension injects the same standalone entry the bookmarklet serves, so
// both always ship the inspector from one source.
const inspectorOptions = clientBuildOptions(
  resolve(packageRoot, "../nudge-ui/src/inspector/bookmarklet.ts"),
  resolve(outputDirectory, "nudge-ui.js"),
);
await build({
  ...inspectorOptions,
  format: "iife",
  define: { ...inspectorOptions.define, "process.env.NODE_ENV": '"production"' },
  minify: true,
  logLevel: "warning",
});

await build({
  entryPoints: [resolve(packageRoot, "src/serviceWorker.ts")],
  outfile: resolve(outputDirectory, "service-worker.js"),
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  logLevel: "warning",
});

const manifest = JSON.parse(readFileSync(resolve(packageRoot, "src/manifest.json"), "utf8"));
writeFileSync(resolve(outputDirectory, "manifest.json"), `${JSON.stringify({ ...manifest, version }, null, 2)}\n`);
