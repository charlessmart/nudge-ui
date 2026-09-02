import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createAgentCompanion } from "./server.ts";

describe("standard MCP companion", () => {
  it("delivers a browser prompt through the long-lived MCP listen tool", async () => {
    const companion = createAgentCompanion({
      projectId: "mcp-project",
      origin: "http://localhost:5173",
      port: 0,
      tokenFactory: () => "mcp-session",
      idFactory: () => "mcp-request",
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "nudge-test-client", version: "1.0.0" });
    const starting = companion.start(serverTransport);
    await client.connect(clientTransport);
    const started = await starting;
    try {
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name)).toEqual(expect.arrayContaining([
        "nudge_listen",
        "nudge_report_status",
        "nudge_present_routes",
        "nudge_read_canvas",
      ]));
      expect(client.getInstructions()).toContain("keep the call open");

      companion.bridge.pairBrowser("mcp-project", "http://localhost:5173");
      const listening = client.callTool({ name: "nudge_listen", arguments: {} });
      const dispatched = await fetch(`${started.address.url}/prompt`, {
        method: "POST",
        headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "mcp-project",
          sessionToken: "mcp-session",
          prompt: "Build three landing page routes",
          changeRevision: 91,
        }),
      });
      expect(dispatched.status).toBe(202);

      const result = await listening;
      expect(result.content).toMatchObject([{
        type: "text",
        text: expect.stringContaining("Build three landing page routes"),
      }]);
      expect(result.content).toMatchObject([{
        text: expect.stringContaining('"changeRevision":91'),
      }]);
    } finally {
      await client.close();
      await companion.close();
    }
  });

  it("presents routes against the configured origin", async () => {
    const companion = createAgentCompanion({
      projectId: "configured-mcp-project",
      origin: "http://localhost:5173",
      port: 0,
      commandTimeoutMs: 10,
      tokenFactory: () => "configured-mcp-session",
      idFactory: () => "configured-mcp-command",
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "nudge-test-client", version: "1.0.0" });
    const starting = companion.start(serverTransport);
    await client.connect(clientTransport);
    await starting;
    try {
      companion.bridge.pairBrowser("configured-mcp-project", "http://localhost:5173");
      const result = await client.callTool({
        name: "nudge_present_routes",
        arguments: {
          label: "Test",
          groupId: "agent-test",
          routes: [{ url: "http://localhost:5173/x" }],
        },
      });
      const text = (result.content as { type: string; text: string }[] | undefined)?.[0]?.text ?? "";
      // Without a browser attached the command times out, proving the tool got
      // past the configured-origin gate.
      expect(text).toContain("ack_timeout");
      expect(text).not.toContain("Canvas routes require");
    } finally {
      await client.close();
      await companion.close();
    }
  });
});
