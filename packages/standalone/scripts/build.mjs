import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { buildStandaloneClient } from "./build-client.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const cliOutput = resolve(packageRoot, "dist/design-tool.mjs");
mkdirSync(dirname(cliOutput), { recursive: true });

await buildStandaloneClient();
await build({
  entryPoints: [resolve(packageRoot, "src/cli.ts")],
  outfile: cliOutput,
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node20",
  // Some CSS inventory dependencies are CommonJS. Provide Node's native
  // require inside the ESM bundle so their lazy built-in imports remain valid.
  banner: {
    js: 'import { createRequire as __designToolCreateRequire } from "node:module"; const require = __designToolCreateRequire(import.meta.url);',
  },
  sourcemap: false,
  logLevel: "silent",
});
