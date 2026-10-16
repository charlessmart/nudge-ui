import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { context } from "esbuild";
import { clientBuildOptions } from "../../../scripts/build-browser-client.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const options = clientBuildOptions(
  resolve(packageRoot, "src/inspector/client.ts"),
  resolve(packageRoot, "dist/client.mjs"),
);

const watcher = await context({
  ...options,
  logLevel: "info",
  plugins: [
    ...options.plugins,
    { name: "rebuild-log", setup: (build) => build.onEnd((result) => console.log(`client rebuilt (${result.errors.length} errors)`)) },
  ],
});
await watcher.watch();
