import { rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { buildBrowserClient } from "../../../scripts/build-browser-client.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const clientEntry = resolve(packageRoot, "src/client.ts");
const clientOutput = resolve(packageRoot, "dist/client.mjs");

await buildBrowserClient(build, clientEntry, clientOutput);
rmSync(resolve(packageRoot, "dist/client.js"), { force: true });
rmSync(resolve(packageRoot, "dist/client.d.ts"), { force: true });
