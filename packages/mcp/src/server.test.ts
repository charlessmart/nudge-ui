import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";
import { createAgentCompanion } from "./server.ts";

describe("standard MCP companion", () => {
  it("delivers sketch PNGs as native image content after the metadata text", async () => {
    const companion = createAgentCompanion({
      projectId: "mcp-sketch-project",
      origin: "http://localhost:5173",
      port: 0,
      tokenFactory: () => "mcp-sketch-session",
      idFactory: () => "mcp-sketch-request",
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "nudge-test-client", version: "1.0.0" });
    const starting = companion.start(serverTransport);
    await client.connect(clientTransport);
    const started = await starting;
    try {
      companion.bridge.pairBrowser("mcp-sketch-project", "http://localhost:5173");
      const listening = client.callTool({ name: "nudge_listen", arguments: {} });
      const data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
      const dispatched = await fetch(`${started.address.url}/prompt`, {
        method: "POST",
        headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "mcp-sketch-project",
          sessionToken: "mcp-sketch-session",
          prompt: "Review this viewport sketch",
          clientDispatchId: "batch-1",
          attachments: [{
            id: "sketch-1",
            revision: 1,
            filename: "sketch-sketch-1-r1.png",
            mimeType: "image/png",
            width: 1,
            height: 1,
            byteSize: 68,
            capture: {
              url: "http://localhost:5173/",
              title: "Fixture",
              timestamp: 1,
              viewportWidth: 800,
              viewportHeight: 600,
              scrollX: 0,
              scrollY: 0,
              devicePixelRatio: 1,
              host: "vite-react",
              framework: "React",
            },
            data,
          }],
        }),
      });
      expect(dispatched.status).toBe(202);
      const result = await listening;
      expect(result.content).toMatchObject([
        { type: "text", text: expect.stringContaining('"clientDispatchId":"batch-1"') },
        { type: "text", text: "Sketch image: sketch-sketch-1-r1.png" },
        { type: "image", data, mimeType: "image/png" },
      ]);
      const content = result.content as Array<{ readonly type: string; readonly text?: string }>;
      expect(content[0]).toMatchObject({ type: "text" });
      expect(content[0]?.text).not.toContain(data);
    } finally {
      await client.close();
      await companion.close();
    }
  });

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
