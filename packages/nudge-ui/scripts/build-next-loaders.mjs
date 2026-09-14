/**
 * Compiles the compiler-facing loader entries to self-contained CommonJS
 * modules under dist/hosts/next/loaders/. Neither webpack nor Turbopack can
 * execute the TypeScript sources, so both register these bundles.
 */
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const outdir = resolve(packageRoot, "dist", "hosts", "next", "loaders");
mkdirSync(outdir, { recursive: true });

await Promise.all([
  build({
    entryPoints: [resolve(packageRoot, "src/hosts/next/loader-plugin.cts")],
    outfile: resolve(outdir, "loader-plugin.cjs"),
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node20",
    // Fully self-contained: raw-TS plugin exports must never be externalized,
    // or Node 20 fails parsing them at require time.
    sourcemap: false,
    logLevel: "silent",
  }),
  // Webpack-mode alias of the identity loader (same bundle, distinct path so
  // webpack rule matching and turbopack rules never share a cache entry).
  build({
    entryPoints: [resolve(packageRoot, "src/hosts/next/loader-plugin.cts")],
    outfile: resolve(outdir, "identity-loader.cjs"),
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node20",
    sourcemap: false,
    logLevel: "silent",
  }),
]);

console.log("nudge-ui loaders built ->", outdir);
