import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { buildBrowserClient } from "../../../scripts/build-browser-client.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const clientEntry = resolve(packageRoot, "src/client.tsx");
const clientOutput = resolve(packageRoot, "dist/client.mjs");

/** Builds the browser client as one self-contained ES module. */
export async function buildStandaloneClient() {
  await buildBrowserClient(build, clientEntry, clientOutput);
  return clientOutput;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await buildStandaloneClient();
}
