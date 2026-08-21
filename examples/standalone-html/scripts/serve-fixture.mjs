import { spawn } from "node:child_process";
import { cpSync, rmSync } from "node:fs";
import { basename } from "node:path";
import { fileURLToPath } from "node:url";

const args = process.argv.slice(2);
const rootIndex = args.indexOf("--root");
const portIndex = args.indexOf("--port");
const root = rootIndex >= 0 ? args[rootIndex + 1] : undefined;
const port = portIndex >= 0 ? args[portIndex + 1] : undefined;

if (!root || !port) {
  throw new Error("Usage: node scripts/serve-fixture.mjs --root <directory> --port <port>");
}
if (!basename(root).startsWith("design-tool-standalone-e2e-")) {
  throw new Error("The standalone fixture server requires a disposable test root.");
}

const prototypeRoot = fileURLToPath(new URL("../prototype", import.meta.url));
rmSync(root, { recursive: true, force: true });
cpSync(prototypeRoot, root, { recursive: true });

const cliPath = fileURLToPath(new URL("../../../packages/standalone/dist/design-tool.mjs", import.meta.url));
const server = spawn(process.execPath, [
  cliPath,
  "serve",
  root,
  "--host",
  "127.0.0.1",
  "--port",
  port,
], { stdio: "inherit" });

let shuttingDown = false;
function stop(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  server.kill(signal);
}

process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop("SIGTERM"));
server.once("exit", (code, signal) => {
  if (signal && !shuttingDown) process.kill(process.pid, signal);
  process.exitCode = code ?? 1;
});
