/**
 * Compiles the compiler-facing loader entries to self-contained CommonJS
 * modules under dist/webpack/. Webpack cannot execute TypeScript loaders,
 * while Turbopack consumes the raw .cts sources directly — so Turbopack
 * keeps the source path and webpack mode registers these bundles.
 */
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const outdir = resolve(packageRoot, "dist", "webpack");
mkdirSync(outdir, { recursive: true });

await Promise.all([
  build({
    entryPoints: [resolve(packageRoot, "src/loader-plugin.cts")],
    outfile: resolve(outdir, "loader-plugin.cjs"),
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node20",
    external: ["@design-tool/plugin/*", "@design-tool/plugin"],
    sourcemap: false,
    logLevel: "silent",
  }),
  build({
    entryPoints: [resolve(packageRoot, "src/css-inline-loader.cts")],
    outfile: resolve(outdir, "css-inline-loader.cjs"),
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node20",
    sourcemap: false,
    logLevel: "silent",
  }),
]);

console.log("design-tool loaders built ->", outdir);
