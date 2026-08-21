import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const clientEntry = resolve(packageRoot, "src/client.tsx");
const clientOutput = resolve(packageRoot, "dist/client.mjs");

/** Builds the browser client as one self-contained ES module. */
export async function buildStandaloneClient() {
  mkdirSync(dirname(clientOutput), { recursive: true });
  await build({
    entryPoints: [clientEntry],
    outfile: clientOutput,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    define: {
      "import.meta.env.DEV": "true",
    },
    plugins: [inlineCssPlugin],
    sourcemap: false,
    logLevel: "silent",
  });
  return clientOutput;
}

const inlineCssPlugin = {
  name: "design-tool-inline-css",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /\?inline$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.slice(0, -"?inline".length)),
      namespace: "design-tool-inline-css",
    }));
    pluginBuild.onLoad({ filter: /.*/, namespace: "design-tool-inline-css" }, (args) => ({
      contents: `export default ${JSON.stringify(readFileSync(args.path, "utf8"))};`,
      loader: "js",
    }));
  },
};

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await buildStandaloneClient();
}
