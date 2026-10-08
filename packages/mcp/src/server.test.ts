import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startProjectBridge, type ProjectBridgeRuntime } from "./project.ts";
import { createDiscoveredAgentAdapter } from "./server.ts";

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const close of cleanup.reverse()) await close(); cleanup.length = 0; });

/** A running project bridge with a reusable adapter connected to an in-memory MCP client. */
async function connectedProject(commandTimeoutMs?: number) {
  const root = await mkdtemp(join(tmpdir(), "nudge-mcp-server-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const registryRoot = join(root, "registry");
  const runtime = await startProjectBridge({
    appRoot: root, registryRoot, projectId: "mcp-project", origin: "http://localhost:5173", port: 0, commandTimeoutMs,
  });
  cleanup.push(() => runtime.close());
  const adapter = createDiscoveredAgentAdapter({ registryRoot });
  const client = new Client({ name: "nudge-test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  cleanup.push(() => adapter.close(), () => client.close());
  await Promise.all([adapter.start(serverTransport), client.connect(clientTransport)]);
  const pairing = runtime.bridge.pairBrowser(runtime.session.origin);
  return { runtime, client, workspaceRoot: runtime.session.appRoot, sessionToken: pairing.sessionToken };
}

async function waitForListener(runtime: ProjectBridgeRuntime): Promise<void> {
  await vi.waitFor(() => expect(runtime.bridge.getStatus().listenerActive).toBe(true), { timeout: 2_000, interval: 10 });
}

async function sendPrompt(runtime: ProjectBridgeRuntime, body: Record<string, unknown>): Promise<Response> {
  return await fetch(`${runtime.address.url}/prompt`, {
    method: "POST",
    headers: { Origin: runtime.session.origin, "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: runtime.session.projectId, ...body }),
  });
}

describe("standard MCP adapter", () => {
  it("delivers sketch PNGs as native image content after the metadata text", async () => {
    const { runtime, client, workspaceRoot, sessionToken } = await connectedProject();
    const listening = client.callTool({ name: "nudge_listen", arguments: { workspaceRoot } });
    await waitForListener(runtime);
    const data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const dispatched = await sendPrompt(runtime, {
      sessionToken,
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
    });
    expect(dispatched.status).toBe(202);

    const result = await listening;
    expect(result.content).toMatchObject([
      { type: "text", text: expect.stringContaining('"clientDispatchId":"batch-1"') },
      { type: "text", text: "Sketch image: sketch-sketch-1-r1.png" },
      { type: "image", data, mimeType: "image/png" },
    ]);
    const content = result.content as Array<{ readonly type: string; readonly text?: string }>;
    expect(content[0]?.text).not.toContain(data);
    const requestId = runtime.bridge.getStatus().request!.requestId;
    const recovered = await client.callTool({ name: "nudge_get_request", arguments: { workspaceRoot, requestId } });
    expect(recovered.content).toEqual(result.content);
    const relistened = await client.callTool({ name: "nudge_listen", arguments: { workspaceRoot } });
    expect(relistened.content).toEqual(result.content);
    expect(runtime.bridge.getStatus().request?.status).toBe("delivered");
  });

  it("delivers a browser prompt through the long-lived MCP listen tool", async () => {
    const { runtime, client, workspaceRoot, sessionToken } = await connectedProject();
    expect(client.getInstructions()).toContain("keep the call open");

    const listening = client.callTool({ name: "nudge_listen", arguments: { workspaceRoot } });
    await waitForListener(runtime);
    const dispatched = await sendPrompt(runtime, { sessionToken, prompt: "Build three landing page routes", changeRevision: 91 });
    expect(dispatched.status).toBe(202);

    const result = await listening;
    const request = JSON.parse((result.content as Array<{ text: string }>)[0]!.text);
    expect(request).toMatchObject({
      type: "implementation_request",
      prompt: "Build three landing page routes",
      changeRevision: 91,
      workspaceRoot,
      instructions: expect.stringContaining("Implement the prompt"),
    });
    expect(request.instructions).toContain("nudge_listen");
    expect(request.instructions).toContain("host's normal approval flow");
    expect(runtime.bridge.getStatus().request?.status).toBe("delivered");
    const recovered = await client.callTool({ name: "nudge_get_request", arguments: { workspaceRoot, requestId: request.requestId } });
    expect(recovered.content).toEqual(result.content);
    const beforeAcknowledgment = await client.callTool({
      name: "nudge_report_activity",
      arguments: { workspaceRoot, requestId: request.requestId, file: "src/Card.tsx", operation: "read" },
    });
    expect(beforeAcknowledgment.isError).toBe(true);
    const acknowledged = await client.callTool({
      name: "nudge_report_status", arguments: { workspaceRoot, requestId: request.requestId, status: "working" },
    });
    expect(acknowledged.isError).not.toBe(true);
    expect(runtime.bridge.getStatus().request?.status).toBe("working");
    const afterAcknowledgment = await client.callTool({ name: "nudge_get_request", arguments: { workspaceRoot, requestId: request.requestId } });
    expect(afterAcknowledgment.isError).toBe(true);
    const activity = await client.callTool({
      name: "nudge_report_activity",
      arguments: { workspaceRoot, requestId: request.requestId, file: "src/Card.tsx", operation: "edit", line: 10 },
    });
    expect(activity.isError).not.toBe(true);
    const stale = await client.callTool({
      name: "nudge_report_activity",
      arguments: { workspaceRoot, requestId: "old-request", file: "src/Card.tsx", operation: "read" },
    });
    expect(stale.isError).toBe(true);
    const completed = await client.callTool({
      name: "nudge_report_status",
      arguments: { workspaceRoot, requestId: request.requestId, status: "completed", summary: "Implemented and verified the routes" },
    });
    expect(completed.isError).not.toBe(true);
    expect(runtime.bridge.getStatus().request).toMatchObject({ requestId: request.requestId, status: "completed" });
    const late = await client.callTool({
      name: "nudge_report_activity",
      arguments: { workspaceRoot, requestId: request.requestId, file: "src/Card.tsx", operation: "read" },
    });
    expect(late.isError).toBe(true);
  });

  it("rejects a tool call without a workspace", async () => {
    const { client } = await connectedProject();

    const result = await client.callTool({ name: "nudge_get_status", arguments: {} });

    expect(result.isError).toBe(true);
  });

  it("presents routes against the project origin", async () => {
    const { client, workspaceRoot } = await connectedProject(10);

    const result = await client.callTool({
      name: "nudge_present_routes",
      arguments: { workspaceRoot, label: "Test", groupId: "agent-test", routes: [{ url: "http://localhost:5173/x" }] },
    });

    // Without a browser stream the command times out, proving the route passed origin validation.
    const text = (result.content as { type: string; text: string }[] | undefined)?.[0]?.text ?? "";
    expect(text).toContain("ack_timeout");
  });
});
