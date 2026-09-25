import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AdapterRouting } from "./adapterRouting.ts";
import { diagnoseProjectSessions, discoverProjectSessions } from "./discovery.ts";
import { createDiscoveredAgentAdapter } from "./server.ts";
import { startProjectBridge, type ProjectBridgeRuntime } from "./project.ts";

const cleanup: Array<() => Promise<unknown>> = [];
afterEach(async () => { for (const close of cleanup.reverse()) await close(); cleanup.length = 0; });

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "nudge-global-"));
  cleanup.push(() => rm(root, { recursive: true, force: true }));
  const first = join(root, "portfolio");
  const second = join(root, "examples");
  const registryRoot = join(root, "registry");
  await Promise.all([mkdir(first), mkdir(second)]);
  return { first, second, registryRoot };
}

async function bridge(appRoot: string, registryRoot: string, projectId: string) {
  const runtime = await startProjectBridge({ appRoot, registryRoot, projectId, origin: "http://localhost:5173", port: 0 });
  cleanup.push(() => runtime.close());
  return runtime;
}

async function sendPrompt(runtime: ProjectBridgeRuntime, prompt: string) {
  const pairing = runtime.bridge.pairBrowser(runtime.session.projectId, runtime.session.origin);
  return await fetch(`${runtime.address.url}/prompt`, {
    method: "POST", headers: { Origin: runtime.session.origin, "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: runtime.session.projectId, sessionToken: pairing.sessionToken, prompt }),
  });
}

function textContent(result: Record<string, unknown>) {
  return JSON.parse((result.content as Array<{ text: string }>)[0]!.text) as Record<string, unknown>;
}

describe("reusable MCP adapter", () => {
  it("loads its tools without a dev server or startup workspace", async () => {
    const paths = await fixture();
    const adapter = await createDiscoveredAgentAdapter({ registryRoot: paths.registryRoot });
    const client = new Client({ name: "test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    cleanup.push(() => adapter.close(), () => client.close());
    await Promise.all([adapter.start(b), client.connect(a)]);
    const tools = await client.listTools();
    expect(tools.tools.find((tool) => tool.name === "nudge_listen")?.inputSchema.required).toContain("workspaceRoot");
    const result = await client.callTool({ name: "nudge_list_sessions", arguments: { workspaceRoot: paths.first } });
    expect(textContent(result)).toEqual([]);
    const canonicalApplication = await realpath(paths.first);
    const diagnosis = textContent(await client.callTool({
      name: "nudge_diagnose",
      arguments: { workspaceRoot: paths.first },
    }));
    expect(diagnosis).toMatchObject({
      registryRoot: paths.registryRoot,
      workspaceRoot: canonicalApplication,
      applicationRoot: canonicalApplication,
    });
    await expect(diagnoseProjectSessions(paths.first, paths.registryRoot)).resolves.toMatchObject({
      registryRoot: paths.registryRoot,
      workspaceRoot: canonicalApplication,
      applicationRoot: canonicalApplication,
      descriptorCount: 0,
      reachableCount: 0,
    });
  });

  it("keeps concurrent project listeners, status updates, and release independent", async () => {
    const paths = await fixture();
    const first = await bridge(paths.first, paths.registryRoot, "portfolio");
    const second = await bridge(paths.second, paths.registryRoot, "examples");
    const adapter = await createDiscoveredAgentAdapter({ registryRoot: paths.registryRoot });
    const client = new Client({ name: "test", version: "1" });
    const [a, b] = InMemoryTransport.createLinkedPair();
    cleanup.push(() => adapter.close(), () => client.close());
    await Promise.all([adapter.start(b), client.connect(a)]);
    const portfolio = client.callTool({ name: "nudge_listen", arguments: { workspaceRoot: paths.first } });
    const examples = client.callTool({ name: "nudge_listen", arguments: { workspaceRoot: paths.second } });
    await vi.waitFor(() => {
      expect(first.bridge.getStatus().listenerActive).toBe(true);
      expect(second.bridge.getStatus().listenerActive).toBe(true);
    });
    expect((await sendPrompt(first, "Edit portfolio")).status).toBe(202);
    expect((await sendPrompt(second, "Edit examples")).status).toBe(202);
    const portfolioRequest = textContent(await portfolio);
    expect(portfolioRequest.prompt).toBe("Edit portfolio");
    expect(textContent(await examples).prompt).toBe("Edit examples");
    const status = await client.callTool({ name: "nudge_report_status", arguments: {
      workspaceRoot: paths.first, requestId: portfolioRequest.requestId, status: "completed",
    } });
    expect(status.isError).not.toBe(true);
    expect(first.bridge.getStatus().request?.status).toBe("completed");
    expect(second.bridge.getStatus().request?.status).toBe("working");
    await client.callTool({ name: "nudge_release", arguments: { workspaceRoot: paths.first } });
    const sessions = textContent(await client.callTool({ name: "nudge_list_sessions", arguments: { workspaceRoot: paths.second } }));
    expect(sessions).toEqual(expect.arrayContaining([
      expect.objectContaining({ projectId: "portfolio", claimed: false }),
      expect.objectContaining({ projectId: "examples", claimed: true }),
    ]));
  });

  it("refuses the only live project when the requested checkout does not match", async () => {
    const paths = await fixture();
    const live = await bridge(paths.first, paths.registryRoot, "portfolio");
    const routing = new AdapterRouting(paths.registryRoot);
    cleanup.push(() => routing.close());
    await expect(discoverProjectSessions(".", paths.registryRoot)).rejects.toThrow("absolute path");
    await expect(diagnoseProjectSessions(".", paths.registryRoot)).rejects.toThrow("absolute path");
    await expect(routing.target({ workspaceRoot: paths.second })).rejects.toThrow("exact workspace");
    await expect(routing.target({ workspaceRoot: paths.second, sessionId: live.session.sessionId })).rejects.toThrow("exact workspace");
    await expect(routing.target({})).rejects.toThrow("absolute path");
    expect(live.bridge.getStatus().listenerActive).toBe(false);
  });

  it("recovers the selected application after restart without selecting another project", async () => {
    const paths = await fixture();
    const first = await bridge(paths.first, paths.registryRoot, "portfolio");
    const routing = new AdapterRouting(paths.registryRoot);
    cleanup.push(() => routing.close());
    const selected = await routing.target({ workspaceRoot: paths.first });
    await selected.getStatus();
    await first.close();
    await bridge(paths.second, paths.registryRoot, "examples");
    await expect(selected.getStatus()).rejects.toThrow("no longer running");
    const restarted = await bridge(paths.first, paths.registryRoot, "portfolio-restarted");
    expect(await routing.target({ workspaceRoot: paths.first })).toBe(selected);
    await expect(selected.getStatus()).resolves.toMatchObject({ projectId: "portfolio-restarted" });
    expect(await routing.target({ workspaceRoot: paths.first, sessionId: restarted.session.sessionId })).toBe(selected);
  });

  it("keeps explicit applications in one workspace separate for Canvas commands", async () => {
    const paths = await fixture();
    const siteRoot = join(paths.first, "site");
    const adminRoot = join(paths.first, "admin");
    await Promise.all([mkdir(siteRoot), mkdir(adminRoot)]);
    const site = await startProjectBridge({ workspaceRoot: paths.first, appRoot: siteRoot, registryRoot: paths.registryRoot, origin: "http://localhost:5173", port: 0 });
    const admin = await startProjectBridge({ workspaceRoot: paths.first, appRoot: adminRoot, registryRoot: paths.registryRoot, origin: "http://localhost:5174", port: 0 });
    cleanup.push(() => site.close(), () => admin.close());
    const routing = new AdapterRouting(paths.registryRoot);
    cleanup.push(() => routing.close());
    await expect(routing.target({ workspaceRoot: paths.first })).rejects.toThrow("Several Nudge apps");
    const siteRouter = await routing.target({ workspaceRoot: paths.first, sessionId: site.session.sessionId });
    const adminRouter = await routing.target({ workspaceRoot: paths.first, sessionId: admin.session.sessionId });
    await expect(siteRouter.getStatus()).resolves.toMatchObject({ projectId: "site" });
    await expect(adminRouter.getStatus()).resolves.toMatchObject({ projectId: "admin" });
    const sitePairing = site.bridge.pairBrowser(site.session.projectId, site.session.origin);
    const adminPairing = admin.bridge.pairBrowser(admin.session.projectId, admin.session.origin);
    const siteCommand = siteRouter.dispatchCanvasCommand({ type: "read-state", commandId: "site-read" });
    const adminCommand = adminRouter.dispatchCanvasCommand({ type: "read-state", commandId: "admin-read" });
    const acknowledge = async (runtime: ProjectBridgeRuntime, sessionToken: string, commandId: string) => {
      const response = await fetch(`${runtime.address.url}/canvas/ack`, {
        method: "POST", headers: { Origin: runtime.session.origin, "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: runtime.session.projectId, sessionToken, commandId, ok: true,
          state: { mode: "canvas", groups: [], focusedGroupId: null, focusedRouteUrl: null } }),
      });
      expect(response.status).toBe(202);
    };
    await vi.waitFor(() => acknowledge(site, sitePairing.sessionToken, "site-read"));
    await vi.waitFor(() => acknowledge(admin, adminPairing.sessionToken, "admin-read"));
    await expect(siteCommand).resolves.toMatchObject({ commandId: "site-read", ok: true });
    await expect(adminCommand).resolves.toMatchObject({ commandId: "admin-read", ok: true });
  });

  it("distinguishes unreachable and incompatible descriptors without leaking credentials", async () => {
    const paths = await fixture();
    const runtime = await bridge(paths.first, paths.registryRoot, "portfolio");
    const path = join(paths.registryRoot, `${runtime.session.sessionId}.json`);
    const descriptor = JSON.parse(await readFile(path, "utf8"));
    await writeFile(path, JSON.stringify({ ...descriptor, controlToken: "x".repeat(32) }), { mode: 0o600 });
    const invalid = await diagnoseProjectSessions(paths.first, paths.registryRoot);
    expect(invalid).toMatchObject({ descriptorCount: 1, invalidCount: 1, matchingUnreachableCount: 0, reachableCount: 0 });
    expect(invalid.guidance.join(" ")).toContain("invalid");
    await writeFile(path, JSON.stringify(descriptor), { mode: 0o600 });
    await runtime.close();
    await writeFile(path, JSON.stringify(descriptor), { mode: 0o600 });
    const unreachable = await diagnoseProjectSessions(paths.first, paths.registryRoot);
    expect(unreachable).toMatchObject({ descriptorCount: 1, matchingUnreachableCount: 1, reachableCount: 0 });
    expect(unreachable.guidance.join(" ")).toContain("sandbox");
    await writeFile(path, JSON.stringify({ ...descriptor, protocolVersion: 999 }), { mode: 0o600 });
    const incompatible = await diagnoseProjectSessions(paths.first, paths.registryRoot);
    expect(incompatible).toMatchObject({ descriptorCount: 1, incompatibleCount: 1, matchingUnreachableCount: 0 });
    expect(JSON.stringify(incompatible)).not.toContain(descriptor.controlToken);
  });
});
