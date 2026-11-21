/** Metro `require`s its Babel transformer in transform workers and cannot execute the TypeScript sources. */
import { build } from "esbuild";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const outdir = resolve(packageRoot, "dist", "hosts", "expo");
mkdirSync(outdir, { recursive: true });

await build({
  entryPoints: [resolve(packageRoot, "src/hosts/expo/babel-transformer.cts")],
  outfile: resolve(outdir, "babel-transformer.cjs"),
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: false,
  logLevel: "silent",
});

console.log("nudge-ui Expo transformer built ->", outdir);
