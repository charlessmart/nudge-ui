import { readFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const clientEntry = resolve(packageRoot, "src/client.ts");
const clientOutput = resolve(packageRoot, "dist/client.mjs");

const inlineCssPlugin = {
  name: "nudge-ui-inline-css",
  setup(pluginBuild) {
    pluginBuild.onResolve({ filter: /\?inline$/ }, (args) => ({
      path: resolve(args.resolveDir, args.path.slice(0, -"?inline".length)),
      namespace: "nudge-ui-inline-css",
    }));
    pluginBuild.onLoad({ filter: /.*/, namespace: "nudge-ui-inline-css" }, (args) => ({
      contents: `export default ${JSON.stringify(readFileSync(args.path, "utf8"))};`,
      loader: "js",
    }));
  },
};

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
  loader: {
    ".svg": "dataurl",
  },
  plugins: [inlineCssPlugin],
  sourcemap: false,
  logLevel: "silent",
});
