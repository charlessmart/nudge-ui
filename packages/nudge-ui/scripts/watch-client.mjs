/**
 * Dev-only watcher for the inspector browser client. Rebuilds
 * `dist/client.mjs` whenever inspector source changes, so consumer dev
 * servers (which serve that bundle verbatim) pick up edits without a package
 * build. Generated output stays out of version control.
 *
 * Importing this module has no side effects; call `startClientWatch()` or run
 * the file directly (`node scripts/watch-client.mjs`).
 */
import { context } from "esbuild";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { clientBuildOptions } from "../../../scripts/build-browser-client.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));

export async function startClientWatch({
  entryPoint = resolve(packageRoot, "src/inspector/client.ts"),
  outputFile = resolve(packageRoot, "dist/client.mjs"),
} = {}) {
  const watchContext = await context({
    ...clientBuildOptions(entryPoint, outputFile),
    // The one-shot build stays silent; a watcher must surface failures.
    logLevel: "warning",
  });
  await watchContext.watch();
  return { dispose: () => watchContext.dispose() };
}

const invokedDirectly = resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  await startClientWatch();
  console.log("[nudge-ui] watching inspector client; rebuilds dist/client.mjs on change");
}
