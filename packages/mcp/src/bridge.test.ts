import { describe, expect, it } from "vitest";
import { createLoopbackBridge, type BridgeClock } from "./bridge.ts";

class FakeClock implements BridgeClock {
  private nextHandle = 0;
  private readonly callbacks = new Map<number, () => void>();

  now(): number { return 0; }

  setTimeout(callback: () => void): number {
    const handle = ++this.nextHandle;
    this.callbacks.set(handle, callback);
    return handle;
  }

  clearTimeout(handle: unknown): void {
    this.callbacks.delete(handle as number);
  }

  tick(): void {
    const callbacks = [...this.callbacks.values()];
    this.callbacks.clear();
    for (const callback of callbacks) callback();
  }
}

async function json(response: Response): Promise<Record<string, any>> {
  return await response.json() as Record<string, any>;
}

function bridgeUrl(bridge: ReturnType<typeof createLoopbackBridge>, path: string): string {
  if (!bridge.address) throw new Error("bridge is not listening");
  return `${bridge.address.url}${path}`;
}

describe("loopback browser bridge", () => {
  it("locks an explicit first browser origin in TOFU mode and rejects another origin", async () => {
    const bridge = createLoopbackBridge({
      projectId: "sandbox",
      port: 0,
      tokenFactory: () => "session-tofu",
      idFactory: () => "request-tofu",
    });
    await bridge.start();
    try {
      const listener = bridge.waitForPrompt();
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
      expect(pairing.sessionToken).toBe("session-tofu");
      expect(pairing.pageUrl).toBe("http://localhost:5173/second#hero");

      const status = await fetch(`${bridgeUrl(bridge, "/status")}?projectId=sandbox&sessionToken=session-tofu`, {
        headers: { Origin: "http://localhost:5173" },
      });
      expect(status.status).toBe(200);
      expect((await json(status)).pageUrl).toBe("http://localhost:5173/second#hero");

      const dispatched = await fetch(bridgeUrl(bridge, "/prompt"), {
        method: "POST",
        headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: "sandbox",
          sessionToken: "session-tofu",
          prompt: "Update the heading",
          changeRevision: 7,
        }),
      });
      expect(dispatched.status).toBe(202);
      await expect(listener).resolves.toMatchObject({
        requestId: "request-tofu",
        prompt: "Update the heading",
        changeRevision: 7,
      });
      expect(bridge.getStatus().request?.status).toBe("working");

      bridge.updateRequestStatus({ requestId: "request-tofu", status: "completed", summary: "Done" });
      expect(bridge.getStatus()).toMatchObject({
        connection: "paired",
        request: { status: "completed", summary: "Done" },
      });

      const nextListener = bridge.waitForPrompt();
      const nextDispatched = await fetch(bridgeUrl(bridge, "/prompt"), {
        method: "POST",
        headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "sandbox", sessionToken: "session-tofu", prompt: "Second request" }),
      });
      expect(nextDispatched.status).toBe(202);
      await expect(nextListener).resolves.toMatchObject({ prompt: "Second request" });

      const wrongOrigin = await fetch(`${bridgeUrl(bridge, "/status")}?projectId=sandbox&sessionToken=session-tofu`, {
        headers: { Origin: "http://127.0.0.1:5173" },
      });
      expect(wrongOrigin.status).toBe(403);
    } finally {
      await bridge.close();
    }
  });

  it("uses the TOFU paired origin as the effective origin for Canvas routes", async () => {
    const clock = new FakeClock();
    const bridge = createLoopbackBridge({
      projectId: "tofu-canvas",
      port: 0,
      commandTimeoutMs: 10,
      clock,
      tokenFactory: () => "tofu-canvas-session",
      idFactory: () => "tofu-canvas-command",
    });
    await bridge.start();
    try {
      expect(bridge.effectiveOrigin).toBeNull();

      const paired = await fetch(bridgeUrl(bridge, "/pair"), {
        method: "POST",
        headers: { Origin: "http://localhost:5173", "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "tofu-canvas", origin: "http://localhost:5173" }),
      });
      expect(paired.status).toBe(200);
      expect(bridge.origin).toBeNull();
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
        commandId: "tofu-canvas-command",
        ok: false,
        error: { code: "ack_timeout" },
      });
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
