import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

/** Builds one self-contained browser client with inline stylesheet imports. */
export async function buildBrowserClient(build, entryPoint, outputFile) {
  mkdirSync(dirname(outputFile), { recursive: true });
  await build({
    entryPoints: [entryPoint],
    outfile: outputFile,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    define: { "import.meta.env.DEV": "true" },
    loader: { ".svg": "dataurl" },
    plugins: [inlineCssPlugin],
    minifyWhitespace: true,
    sourcemap: false,
    logLevel: "silent",
  });
}

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
