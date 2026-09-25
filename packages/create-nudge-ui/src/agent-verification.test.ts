import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { verifyAgentServer } from "./agent-verification.ts";

const moduleUrl = (name: string) => pathToFileURL(createRequire(import.meta.url).resolve(name)).href;
const directories: string[] = [];
afterEach(async () => { await Promise.all(directories.splice(0).map((path) => rm(path, { recursive: true, force: true }))); });

/** Starts a real stdio MCP server with a controlled tool catalog. */
async function server(tools: unknown[]) {
  const directory = await mkdtemp(join(tmpdir(), "nudge-verification-"));
  directories.push(directory);
  const entry = join(directory, "server.mjs");
  await writeFile(entry, `
import { Server } from ${JSON.stringify(moduleUrl("@modelcontextprotocol/sdk/server/index.js"))};
import { StdioServerTransport } from ${JSON.stringify(moduleUrl("@modelcontextprotocol/sdk/server/stdio.js"))};
import { ListToolsRequestSchema } from ${JSON.stringify(moduleUrl("@modelcontextprotocol/sdk/types.js"))};
const server = new Server({ name: "setup-test", version: "1" }, { capabilities: { tools: {} } });
server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: ${JSON.stringify(tools)} }));
await server.connect(new StdioServerTransport());
`);
  return { command: process.execPath, args: [entry] };
}

describe("MCP setup verification", () => {
  it("accepts an executable only after initialization and reusable tool discovery", async () => {
    const config = await server([
      { name: "nudge_listen", inputSchema: { type: "object", properties: { workspaceRoot: { type: "string" } }, required: ["workspaceRoot"] } },
      { name: "nudge_list_sessions", inputSchema: { type: "object" } },
    ]);
    await expect(verifyAgentServer(config)).resolves.toBeUndefined();
  });

  it("rejects a server that initializes but exposes an obsolete tool catalog", async () => {
    const config = await server([{ name: "nudge_listen", inputSchema: { type: "object" } }]);
    await expect(verifyAgentServer(config)).rejects.toThrow("connection-time project selection");
  });
});
