import { mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { clientBuildOptions } from "../../../scripts/build-browser-client.mjs";

const packageRoot = fileURLToPath(new URL("..", import.meta.url));
const entry = resolve(packageRoot, "src/inspector/bookmarklet.ts");
const output = resolve(packageRoot, "dist/bookmarklet.js");
const port = Number(process.env.NUDGE_UI_BOOKMARKLET_PORT ?? 5199);

const baseOptions = clientBuildOptions(entry, output);
mkdirSync(dirname(output), { recursive: true });
await build({
  ...baseOptions,
  format: "iife",
  define: { ...baseOptions.define, "process.env.NODE_ENV": '"production"' },
  minify: true,
  logLevel: "warning",
});

if (process.argv.includes("--build-only")) process.exit(0);

createServer((request, response) => {
  if (!request.url?.startsWith("/bookmarklet.js")) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    "content-type": "text/javascript; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
  });
  response.end(readFileSync(output));
}).listen(port, "127.0.0.1", () => {
  const scriptUrl = `http://127.0.0.1:${port}/bookmarklet.js`;
  const bookmarklet = `javascript:(()=>{const s=document.createElement("script");s.src="${scriptUrl}?t="+Date.now();document.head.append(s)})()`;
  console.log(`Serving ${scriptUrl}\n\nBookmarklet URL:\n\n${bookmarklet}\n`);
});
