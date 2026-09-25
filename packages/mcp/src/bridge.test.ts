import { describe, expect, it } from "vitest";
import { createLoopbackBridge, type BridgeClock } from "./bridge.ts";

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

  tick(): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const { callback } of callbacks) callback();
  }

  advance(delayMs: number): void {
    this.time += delayMs;
    const due = [...this.callbacks.entries()].filter(([, scheduled]) => scheduled.at <= this.time);
    for (const [handle] of due) this.callbacks.delete(handle);
    for (const [, { callback }] of due) callback();
  }
}

async function json(response: Response): Promise<Record<string, any>> {
  return await response.json() as Record<string, any>;
}

async function waitUntil(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (predicate()) return;
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  throw new Error("condition was not reached");
}

function bridgeUrl(bridge: ReturnType<typeof createLoopbackBridge>, path: string): string {
  if (!bridge.address) throw new Error("bridge is not listening");
  return `${bridge.address.url}${path}`;
}

describe("loopback browser bridge", () => {
  it("expires an abandoned agent claim and cancels its listener", async () => {
    const clock = new FakeClock();
    const controlToken = "a".repeat(32);
    const bridge = createLoopbackBridge({
      projectId: "claim-expiry",
      origin: "http://localhost:5173",
      port: 0,
      clock,
      agentControlToken: controlToken,
    });
    await bridge.start();
    const control = (path: string, agentId: string): Promise<Response> => fetch(bridgeUrl(bridge, path), {
      method: "POST",
      headers: { Authorization: `Bearer ${controlToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ agentId }),
    });
    try {
      expect((await control("/__nudge/agent/claim", "abandoned-agent")).status).toBe(200);
      const listening = control("/__nudge/agent/listen", "abandoned-agent");
      await waitUntil(() => bridge.getStatus().listenerActive);

      clock.advance(30_000);

      expect((await listening).status).toBe(409);
      expect(bridge.getStatus().listenerActive).toBe(false);
      expect((await control("/__nudge/agent/claim", "replacement-agent")).status).toBe(200);
    } finally {
      await bridge.close();
    }
  });

  it("accepts explicit loopback aliases and makes same-session pairing idempotent", async () => {
    const bridge = createLoopbackBridge({
      projectId: "aliases",
      origin: "http://localhost:5173",
      allowedOrigins: ["http://localhost:5173", "http://127.0.0.1:5173"],
      port: 0,
      tokenFactory: () => "alias-session",
    });
    await bridge.start();
    try {
      const pair = (sessionToken?: string): Promise<Response> => fetch(bridgeUrl(bridge, "/pair"), {
        method: "POST",
        headers: { Origin: "http://127.0.0.1:5173", "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "aliases",
          origin: "http://127.0.0.1:5173",
          pageUrl: "http://127.0.0.1:5173/page",
          ...(sessionToken ? { sessionToken } : {}),
        }),
      });
      const first = await pair();
      expect(first.status).toBe(200);
      expect((await json(first)).origin).toBe("http://127.0.0.1:5173");
      expect(bridge.effectiveOrigin).toBe("http://127.0.0.1:5173");

      const health = await fetch(`${bridgeUrl(bridge, "/health")}?projectId=aliases`, {
        headers: { Origin: "http://127.0.0.1:5173" },
      });
      expect(health.status).toBe(200);
      expect((await json(health)).origin).toBe("http://127.0.0.1:5173");

      expect((await pair("alias-session")).status).toBe(200);
      expect((await pair()).status).toBe(409);
    } finally {
      await bridge.close();
    }
  });

  it("replaces an existing browser pairing only through the explicit takeover endpoint", async () => {
    let tokenNumber = 0;
    const bridge = createLoopbackBridge({
      projectId: "takeover",
      origin: "http://localhost:5173",
      port: 0,
      tokenFactory: () => `session-${++tokenNumber}`,
    });
    await bridge.start();
    const request = (path: string, body: Record<string, unknown>): Promise<Response> => fetch(bridgeUrl(bridge, path), {
      method: "POST",
      headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const body = {
      projectId: "takeover",
      origin: "http://localhost:5173",
      pageUrl: "http://localhost:5173/fixture",
    };
    try {
      const first = await request("/pair", body);
      expect(first.status).toBe(200);
      expect((await json(first)).sessionToken).toBe("session-1");

      const replacement = await request("/takeover", body);
      expect(replacement.status).toBe(200);
      expect((await json(replacement)).sessionToken).toBe("session-2");
      expect(bridge.sessionToken).toBe("session-2");

      const ordinaryPair = await request("/pair", body);
      expect(ordinaryPair.status).toBe(409);
      expect((await json(ordinaryPair)).error.code).toBe("already_paired");
    } finally {
      await bridge.close();
    }
  });

  it("rejects a hostile first connection before pairing a configured browser origin", async () => {
    const bridge = createLoopbackBridge({
      projectId: "sandbox",
      origin: "http://localhost:5173",
      port: 0,
      tokenFactory: () => "session-configured",
      idFactory: () => "request-configured",
    });
    await bridge.start();
    try {
      const listener = bridge.waitForPrompt();

      const hostileHealth = await fetch(`${bridgeUrl(bridge, "/health")}?projectId=sandbox`, {
        headers: { Origin: "http://evil.test" },
      });
      expect(hostileHealth.status).toBe(403);
      expect((await json(hostileHealth)).error.code).toBe("origin_not_allowed");

      const hostilePair = await fetch(bridgeUrl(bridge, "/pair"), {
        method: "POST",
        headers: { Origin: "http://evil.test", "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "sandbox",
          origin: "http://evil.test",
          pageUrl: "http://evil.test/steal",
        }),
      });
      expect(hostilePair.status).toBe(403);
      expect((await json(hostilePair)).error.code).toBe("origin_not_allowed");
      expect(bridge.sessionToken).toBeNull();
      expect(() => bridge.pairBrowser("sandbox", "http://evil.test")).toThrow("not in the configured allow-list");

      const healthBeforePair = await fetch(`${bridgeUrl(bridge, "/health")}?projectId=sandbox`, {
        headers: { Origin: "http://localhost:5173" },
      });
      expect(healthBeforePair.status).toBe(200);
      expect((await json(healthBeforePair)).status.listenerActive).toBe(true);

      const paired = await fetch(bridgeUrl(bridge, "/pair"), {
        method: "POST",
        headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "sandbox",
          origin: "http://localhost:5173",
          pageUrl: "http://localhost:5173/second#hero",
        }),
      });
      expect(paired.status).toBe(200);
      const pairing = await json(paired);
      expect(pairing.sessionToken).toBe("session-configured");
      expect(pairing.pageUrl).toBe("http://localhost:5173/second#hero");

      const status = await fetch(`${bridgeUrl(bridge, "/status")}?projectId=sandbox&sessionToken=session-configured`, {
        headers: { Origin: "http://localhost:5173" },
      });
      expect(status.status).toBe(200);
      expect((await json(status)).pageUrl).toBe("http://localhost:5173/second#hero");

      const dispatched = await fetch(bridgeUrl(bridge, "/prompt"), {
        method: "POST",
        headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "sandbox",
          sessionToken: "session-configured",
          prompt: "Update the heading",
          changeRevision: 7,
        }),
      });
      expect(dispatched.status).toBe(202);
      await expect(listener).resolves.toMatchObject({
        requestId: "request-configured",
        prompt: "Update the heading",
        changeRevision: 7,
      });
      expect(bridge.getStatus().request?.status).toBe("working");

      bridge.updateRequestStatus({ requestId: "request-configured", status: "completed", summary: "Done" });
      expect(bridge.getStatus()).toMatchObject({
        connection: "paired",
        request: { status: "completed", summary: "Done" },
      });

      const nextListener = bridge.waitForPrompt();
      const nextDispatched = await fetch(bridgeUrl(bridge, "/prompt"), {
        method: "POST",
        headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "sandbox", sessionToken: "session-configured", prompt: "Second request" }),
      });
      expect(nextDispatched.status).toBe(202);
      await expect(nextListener).resolves.toMatchObject({ prompt: "Second request" });

      const wrongOrigin = await fetch(`${bridgeUrl(bridge, "/status")}?projectId=sandbox&sessionToken=session-configured`, {
        headers: { Origin: "http://127.0.0.1:5173" },
      });
      expect(wrongOrigin.status).toBe(403);
    } finally {
      await bridge.close();
    }
  });

  it("uses the configured origin as the effective origin for Canvas routes", async () => {
    const clock = new FakeClock();
    const bridge = createLoopbackBridge({
      projectId: "configured-canvas",
      origin: "http://localhost:5173",
      port: 0,
      commandTimeoutMs: 10,
      clock,
      tokenFactory: () => "configured-canvas-session",
      idFactory: () => "configured-canvas-command",
    });
    await bridge.start();
    try {
      expect(bridge.effectiveOrigin).toBe("http://localhost:5173");

      const paired = await fetch(bridgeUrl(bridge, "/pair"), {
        method: "POST",
        headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "configured-canvas", origin: "http://localhost:5173" }),
      });
      expect(paired.status).toBe(200);
      expect(bridge.origin).toBe("http://localhost:5173");
      expect(bridge.effectiveOrigin).toBe("http://localhost:5173");

      const resultPromise = bridge.dispatchCanvasCommand({
        type: "present-routes",
        groupId: "agent-test",
        label: "Test",
        routes: [{ url: "http://localhost:5173/x" }],
      });
      clock.tick();
      // Without an SSE browser attached the command resolves as a timeout,
      // proving the dispatch got past the origin gate.
      await expect(resultPromise).resolves.toMatchObject({
        commandId: "configured-canvas-command",
        ok: false,
        error: { code: "ack_timeout" },
      });
    } finally {
      await bridge.close();
    }
  });

  it("keeps an unconfigured HTTP pairing closed until trusted host code approves it", async () => {
    const bridge = createLoopbackBridge({
      projectId: "manual-pairing",
      port: 0,
      tokenFactory: () => "manual-session",
    });
    await bridge.start();
    try {
      const health = await fetch(`${bridgeUrl(bridge, "/health")}?projectId=manual-pairing`, {
        headers: { Origin: "http://localhost:5173" },
      });
      expect(health.status).toBe(403);

      const pair = await fetch(bridgeUrl(bridge, "/pair"), {
        method: "POST",
        headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "manual-pairing", origin: "http://localhost:5173" }),
      });
      expect(pair.status).toBe(403);
      expect(bridge.sessionToken).toBeNull();

      // Host-side approval remains available for callers that can establish
      // the origin out of band; it does not make HTTP first-pairing permissive.
      expect(bridge.pairBrowser("manual-pairing", "http://localhost:5173").sessionToken).toBe("manual-session");
      const status = await fetch(`${bridgeUrl(bridge, "/status")}?projectId=manual-pairing&sessionToken=manual-session`, {
        headers: { Origin: "http://localhost:5173" },
      });
      expect(status.status).toBe(200);
      expect((await json(status)).paired).toBe(true);
    } finally {
      await bridge.close();
    }
  });

  it("allows HTTP pairing only for an explicitly configured origin allow-list", async () => {
    const bridge = createLoopbackBridge({
      projectId: "allow-list-pairing",
      allowedOrigins: ["http://localhost:5173"],
      port: 0,
      tokenFactory: () => "allow-list-session",
    });
    await bridge.start();
    try {
      const hostile = await fetch(bridgeUrl(bridge, "/pair"), {
        method: "POST",
        headers: { Origin: "http://evil.test", "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "allow-list-pairing", origin: "http://evil.test" }),
      });
      expect(hostile.status).toBe(403);

      const legitimate = await fetch(bridgeUrl(bridge, "/pair"), {
        method: "POST",
        headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "allow-list-pairing", origin: "http://localhost:5173" }),
      });
      expect(legitimate.status).toBe(200);
      expect((await json(legitimate)).sessionToken).toBe("allow-list-session");
    } finally {
      await bridge.close();
    }
  });

  it("enforces one listener and one in-flight browser request", async () => {
    const bridge = createLoopbackBridge({
      projectId: "one-at-a-time",
      origin: "http://localhost:5173",
      port: 0,
      tokenFactory: () => "one-session",
      idFactory: () => "one-request",
    });
    await bridge.start();
    bridge.pairBrowser("one-at-a-time", "http://localhost:5173");
    try {
      const firstListener = bridge.waitForPrompt();
      await expect(bridge.waitForPrompt()).rejects.toThrow("already active");
      const first = fetch(bridgeUrl(bridge, "/prompt"), {
        method: "POST",
        headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "one-at-a-time", sessionToken: "one-session", prompt: "first" }),
      });
      expect((await first).status).toBe(202);
      await firstListener;
      await expect(fetch(bridgeUrl(bridge, "/prompt"), {
        method: "POST",
        headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "one-at-a-time", sessionToken: "one-session", prompt: "second" }),
      })).resolves.toMatchObject({ status: 409 });
      await expect(bridge.waitForPrompt()).rejects.toThrow("in flight");
    } finally {
      await bridge.close();
    }
  });

  it("dispatches a Canvas command through the public acknowledgement endpoint", async () => {
    const bridge = createLoopbackBridge({
      projectId: "canvas-project",
      origin: "http://localhost:5173",
      port: 0,
      tokenFactory: () => "canvas-session",
      idFactory: () => "generated-id",
    });
    await bridge.start();
    bridge.pairBrowser("canvas-project", "http://localhost:5173");
    try {
      const resultPromise = bridge.dispatchCanvasCommand({ type: "read-state", commandId: "read-command" });
      const ack = await fetch(bridgeUrl(bridge, "/canvas/ack"), {
        method: "POST",
        headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "canvas-project",
          sessionToken: "canvas-session",
          commandId: "read-command",
          ok: true,
          state: { mode: "canvas", groups: [], focusedGroupId: null, focusedRouteUrl: null },
        }),
      });
      expect(ack.status).toBe(202);
      await expect(resultPromise).resolves.toMatchObject({
        commandId: "read-command",
        ok: true,
        state: { mode: "canvas", groups: [] },
      });
    } finally {
      await bridge.close();
    }
  });

  it("rejects Canvas acknowledgements with malformed state, group, or error payloads", async () => {
    const bridge = createLoopbackBridge({
      projectId: "ack-validate",
      origin: "http://localhost:5173",
      port: 0,
      tokenFactory: () => "ack-session",
      idFactory: () => "ack-command",
    });
    await bridge.start();
    bridge.pairBrowser("ack-validate", "http://localhost:5173");
    try {
      const dispatch = bridge.dispatchCanvasCommand({ type: "read-state", commandId: "ack-command" });
      const post = (body: Record<string, unknown>) => fetch(bridgeUrl(bridge, "/canvas/ack"), {
        method: "POST",
        headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "ack-validate",
          sessionToken: "ack-session",
          commandId: "ack-command",
          ok: true,
          ...body,
        }),
      });

      const badState = await post({ state: { mode: "bogus" } });
      expect(badState.status).toBe(400);
      expect((await json(badState)).error.code).toBe("invalid_acknowledgement");

      const badGroup = await post({ group: { id: "agent-x", owner: "bogus" } });
      expect(badGroup.status).toBe(400);
      expect((await json(badGroup)).error.code).toBe("invalid_acknowledgement");

      const badError = await post({ ok: false, error: { code: 123 } });
      expect(badError.status).toBe(400);
      expect((await json(badError)).error.code).toBe("invalid_acknowledgement");

      // The pending command survives rejected acks and accepts a valid one.
      const ack = await post({
        state: { mode: "canvas", groups: [], focusedGroupId: null, focusedRouteUrl: null },
      });
      expect(ack.status).toBe(202);
      await expect(dispatch).resolves.toMatchObject({ commandId: "ack-command", ok: true });
    } finally {
      await bridge.close();
    }
  });

  it("returns a bounded timeout result when a Canvas acknowledgement is absent", async () => {
    const clock = new FakeClock();
    const bridge = createLoopbackBridge({
      projectId: "timeout-project",
      origin: "http://localhost:5173",
      port: 0,
      commandTimeoutMs: 10,
      clock,
      tokenFactory: () => "timeout-session",
    });
    bridge.pairBrowser("timeout-project", "http://localhost:5173");
    const resultPromise = bridge.dispatchCanvasCommand({ type: "fit-all", commandId: "timeout-command" });
    clock.tick();
    await expect(resultPromise).resolves.toMatchObject({
      commandId: "timeout-command",
      ok: false,
      error: { code: "ack_timeout" },
    });
    await bridge.close();
  });

  it("interrupts an in-flight request when the browser disconnects", async () => {
    const bridge = createLoopbackBridge({
      projectId: "disconnect-project",
      origin: "http://localhost:5173",
      port: 0,
      tokenFactory: () => "disconnect-session",
      idFactory: () => "disconnect-request",
    });
    await bridge.start();
    bridge.pairBrowser("disconnect-project", "http://localhost:5173");
    const listener = bridge.waitForPrompt();
    await (await fetch(bridgeUrl(bridge, "/prompt"), {
      method: "POST",
      headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: "disconnect-project", sessionToken: "disconnect-session", prompt: "partial" }),
    })).arrayBuffer();
    await listener;
    bridge.disconnectBrowser("disconnect-session");
    expect(bridge.getStatus().request).toMatchObject({ status: "interrupted" });
    expect(bridge.getStatus().paired).toBe(false);
    await bridge.close();
  });

  it("asks the host to reopen the last paired page when listening rearms without a controller", async () => {
    const opened: string[] = [];
    const bridge = createLoopbackBridge({
      projectId: "reopen-project",
      origin: "http://localhost:5173",
      port: 0,
      tokenFactory: () => "reopen-session",
      onControllerUnavailable: (pageUrl) => { opened.push(pageUrl); },
    });
    bridge.pairBrowser(
      "reopen-project",
      "http://localhost:5173",
      "http://localhost:5173/landing#compare",
    );

    const listener = bridge.waitForPrompt();
    await Promise.resolve();
    expect(opened).toEqual(["http://localhost:5173/landing#compare"]);
    bridge.cancelListener();
    await expect(listener).rejects.toThrow("listener_cancelled");
    await bridge.close();
  });
});
