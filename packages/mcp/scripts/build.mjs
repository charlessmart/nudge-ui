import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const output = resolve(packageRoot, "dist/cli.mjs");
mkdirSync(dirname(output), { recursive: true });

const sharedOptions = {
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  sourcemap: false,
  logLevel: "silent",
};

// cli.mjs is the published server entry; registrar.mjs backs the postinstall
// script so the Codex registration logic has a single implementation.
await build({
  entryPoints: [resolve(packageRoot, "src/cli.ts")],
  outfile: output,
  ...sharedOptions,
});
await build({
  entryPoints: [resolve(packageRoot, "src/registrar.ts")],
  outfile: resolve(packageRoot, "dist/registrar.mjs"),
  ...sharedOptions,
});
