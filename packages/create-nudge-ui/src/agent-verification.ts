import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { McpServerConfig } from "add-mcp";

/** Verifies the configured executable, initialization, and tools without claiming a project. */
export async function verifyAgentServer(config: McpServerConfig): Promise<void> {
  if (!config.command) throw new Error("The MCP adapter has no executable.");
  const client = new Client({ name: "nudge-setup", version: "1.0.0" });
  const transport = new StdioClientTransport({ command: config.command, args: config.args, stderr: "inherit" });
  try {
    await client.connect(transport, { timeout: 15_000 });
    const { tools } = await client.listTools({}, { timeout: 15_000 });
    const listen = tools.find((tool) => tool.name === "nudge_listen");
    if (!listen?.inputSchema.required?.includes("workspaceRoot") || !tools.some((tool) => tool.name === "nudge_list_sessions")) {
      throw new Error("The installed adapter does not support connection-time project selection. Upgrade @nudge-ui/mcp.");
    }
  } finally {
    await transport.close();
    await client.close();
  }
}
