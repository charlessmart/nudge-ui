import { afterEach, describe, expect, it } from "vitest";
import { createLoopbackBridge, type BrowserBridge, type BrowserBridgeOptions } from "./bridge.ts";
import type { BridgeClock } from "./bridgeSession.ts";

const ORIGIN = "http://localhost:5173";
const CONTROL_TOKEN = "c".repeat(32);

class FakeClock implements BridgeClock {
  private nextHandle = 0;
  private time = 0;
  private readonly callbacks = new Map<number, { at: number; callback: () => void }>();

  now(): number { return this.time; }

  setTimeout(callback: () => void, delayMs: number): number {
    const handle = ++this.nextHandle;
    this.callbacks.set(handle, { at: this.time + delayMs, callback });
    return handle;
  }

  clearTimeout(handle: unknown): void {
    this.callbacks.delete(handle as number);
  }

  advance(delayMs: number): void {
    this.time += delayMs;
    const due = [...this.callbacks.entries()].filter(([, scheduled]) => scheduled.at <= this.time);
    for (const [handle] of due) this.callbacks.delete(handle);
    for (const [, { callback }] of due) callback();
  }
}

const bridges: BrowserBridge[] = [];

afterEach(async () => {
  await Promise.all(bridges.splice(0).map((bridge) => bridge.close()));
});

async function startBridge(overrides: Partial<BrowserBridgeOptions> = {}) {
  let tokens = 0;
  const bridge = createLoopbackBridge({
    projectId: "site",
    origin: ORIGIN,
    port: 0,
    tokenFactory: () => `token-${++tokens}`,
    idFactory: () => "request-1",
    ...overrides,
  });
  bridges.push(bridge);
  const { url } = await bridge.start();
  const browser = (path: string, init: { body?: unknown; origin?: string; method?: string } = {}) => fetch(`${url}${path}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: { Origin: init.origin ?? ORIGIN, "Content-Type": "application/json" },
    ...(init.body === undefined ? {} : { body: typeof init.body === "string" ? init.body : JSON.stringify(init.body) }),
  });
  const agent = (path: string, body?: unknown, token = CONTROL_TOKEN) => fetch(`${url}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { bridge, browser, agent };
}

async function errorOf(response: Response): Promise<{ status: number; code: string }> {
  const body = await response.json() as { error: { code: string } };
  return { status: response.status, code: body.error.code };
}

describe("loopback bridge browser endpoints", () => {
  it("serves CORS only to configured origins", async () => {
    const { browser } = await startBridge();

    const preflight = await browser("/pair", { method: "OPTIONS" });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(ORIGIN);
    expect((await browser("/pair", { method: "OPTIONS", origin: "http://evil.test" })).status).toBe(403);
    expect(await errorOf(await browser("/health?projectId=site", { origin: "http://evil.test" })))
      .toEqual({ status: 403, code: "origin_not_allowed" });
    expect(await errorOf(await browser("/health?projectId=other"))).toEqual({ status: 404, code: "project_not_found" });
  });

  it("pairs over HTTP and authorizes later requests by origin and session token", async () => {
    const { bridge, browser } = await startBridge({ allowedOrigins: ["http://127.0.0.1:5173"] });

    expect(await errorOf(await browser("/pair", { body: { projectId: "site", origin: "http://127.0.0.1:5173" } })))
      .toEqual({ status: 403, code: "origin_mismatch" });
    const paired = await browser("/pair", { body: { projectId: "site", origin: ORIGIN, pageUrl: `${ORIGIN}/pricing` } });
    expect(paired.status).toBe(200);
    expect(await paired.json()).toMatchObject({ sessionToken: "token-1", pageUrl: `${ORIGIN}/pricing` });

    expect((await browser("/status?projectId=site&sessionToken=token-1")).status).toBe(200);
    expect(await errorOf(await browser("/status?projectId=site&sessionToken=token-9")))
      .toEqual({ status: 401, code: "invalid_session" });
    expect(await errorOf(await browser("/status?projectId=site&sessionToken=token-1", { origin: "http://127.0.0.1:5173" })))
      .toEqual({ status: 403, code: "origin_mismatch" });

    expect(await errorOf(await browser("/prompt", { body: { projectId: "site", sessionToken: "token-1", prompt: "Hi" } })))
      .toEqual({ status: 409, code: "listener_unavailable" });
    const listening = bridge.waitForPrompt();
    const dispatched = await browser("/prompt", { body: { projectId: "site", sessionToken: "token-1", prompt: "Hi", changeRevision: 3 } });
    expect(dispatched.status).toBe(202);
    await expect(listening).resolves.toMatchObject({ requestId: "request-1", prompt: "Hi", changeRevision: 3 });
  });

  it("replaces a pairing only through the takeover endpoint", async () => {
    const { browser } = await startBridge();
    const pair = { projectId: "site", origin: ORIGIN };
    await browser("/pair", { body: pair });

    expect(await errorOf(await browser("/pair", { body: pair }))).toEqual({ status: 409, code: "already_paired" });
    const replacement = await browser("/takeover", { body: pair });

    expect(await replacement.json()).toMatchObject({ sessionToken: "token-2" });
    expect((await browser("/status?projectId=site&sessionToken=token-1")).status).toBe(401);
  });

  it("streams server-sent events and accepts the matching Canvas acknowledgement", async () => {
    const { bridge, browser } = await startBridge();
    await browser("/pair", { body: { projectId: "site", origin: ORIGIN } });
    const events = await browser("/events?projectId=site&sessionToken=token-1");
    expect(events.headers.get("content-type")).toContain("text/event-stream");
    const reader = events.body!.getReader();
    const decoder = new TextDecoder();
    let received = "";
    const readUntil = async (marker: string): Promise<void> => {
      while (!received.includes(marker)) {
        const { value, done } = await reader.read();
        if (done) throw new Error(`stream ended before ${marker}`);
        received += decoder.decode(value, { stream: true });
      }
    };

    await readUntil("event: status\n");
    const result = bridge.dispatchCanvasCommand({ type: "fit-all", commandId: "fit-1" });
    await readUntil("event: canvas-command\n");
    expect(received).toContain('"commandId":"fit-1"');
    const ack = await browser("/canvas/ack", { body: { projectId: "site", sessionToken: "token-1", commandId: "fit-1", ok: true } });

    expect(ack.status).toBe(202);
    await expect(result).resolves.toEqual({ commandId: "fit-1", ok: true });
    await reader.cancel();
  });

  it("rejects malformed and oversized request bodies", async () => {
    const { bridge, browser } = await startBridge();
    bridge.pairBrowser(ORIGIN);
    const ack = { projectId: "site", sessionToken: "token-1" };
    const pending = bridge.dispatchCanvasCommand({ type: "read-state", commandId: "read-1" });

    expect(await errorOf(await browser("/canvas/ack", { body: "{" }))).toEqual({ status: 400, code: "invalid_json" });
    expect(await errorOf(await browser("/canvas/ack", { body: { ...ack, commandId: "read-1", ok: true, state: { mode: "bogus" } } })))
      .toEqual({ status: 400, code: "invalid_acknowledgement" });
    expect(await errorOf(await browser("/canvas/ack", { body: { ...ack, padding: "x".repeat(300 * 1024) } })))
      .toEqual({ status: 413, code: "body_too_large" });
    expect(await errorOf(await browser("/prompt", { body: { ...ack, prompt: "" } }))).toEqual({ status: 400, code: "invalid_prompt" });

    const accepted = await browser("/canvas/ack", {
      body: { ...ack, commandId: "read-1", ok: true, state: { mode: "canvas", groups: [], focusedGroupId: null, focusedRouteUrl: null } },
    });
    expect(accepted.status).toBe(202);
    await expect(pending).resolves.toMatchObject({ commandId: "read-1", ok: true });
  });
});

describe("loopback bridge agent control", () => {
  it("is unavailable without a configured control credential", async () => {
    const { agent } = await startBridge();

    expect(await errorOf(await agent("/__nudge/agent/health"))).toEqual({ status: 403, code: "agent_control_unavailable" });
  });

  it("authenticates the adapter and maps session conflicts to HTTP statuses", async () => {
    const { agent } = await startBridge({ agentControlToken: CONTROL_TOKEN });

    expect(await errorOf(await agent("/__nudge/agent/claim", { agentId: "agent-a" }, "w".repeat(32))))
      .toEqual({ status: 401, code: "invalid_agent_credential" });
    expect((await agent("/__nudge/agent/claim", { agentId: "agent-a" })).status).toBe(200);
    expect(await errorOf(await agent("/__nudge/agent/claim", { agentId: "agent-b" }))).toEqual({ status: 409, code: "session_claimed" });
    expect(await errorOf(await agent("/__nudge/agent/heartbeat", { agentId: "agent-b" }))).toEqual({ status: 409, code: "agent_not_owner" });
    expect(await errorOf(await agent("/__nudge/agent/canvas", { agentId: "agent-a", command: { type: "fit-all", commandId: "fit-1" } })))
      .toEqual({ status: 409, code: "browser_unpaired" });
    expect(await agent("/__nudge/agent/health").then((response) => response.json())).toMatchObject({ claimed: true });
  });

  it("answers an expired adapter's open listen call with a conflict", async () => {
    const clock = new FakeClock();
    const { bridge, agent } = await startBridge({ agentControlToken: CONTROL_TOKEN, clock });
    await agent("/__nudge/agent/claim", { agentId: "agent-a" });
    const listening = agent("/__nudge/agent/listen", { agentId: "agent-a" });
    await expect.poll(() => bridge.getStatus().listenerActive).toBe(true);

    clock.advance(30_000);

    expect(await errorOf(await listening)).toEqual({ status: 409, code: "listener_cancelled" });
    expect((await agent("/__nudge/agent/claim", { agentId: "agent-b" })).status).toBe(200);
  });
});
