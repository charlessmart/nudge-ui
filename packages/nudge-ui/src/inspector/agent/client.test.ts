// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setNudgeUiHostDevFlag } from "../runtime/devFlag.ts";
import { AgentClient } from "./client.ts";
import type {
  AgentBridgeTransport,
  AgentCanvasAcknowledgementRequest,
  AgentEventHandlers,
  AgentPromptDispatch,
  AgentStatusSnapshot,
  CanvasCommand,
  PairingResponse,
  PromptDispatchResponse,
} from "./protocol.ts";

function status(overrides: Partial<AgentStatusSnapshot> = {}): AgentStatusSnapshot {
  return {
    protocolVersion: 2,
    projectId: "fixture-project",
    connection: "listening",
    listenerActive: true,
    paired: false,
    request: null,
    ...overrides,
  };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

class FakeTransport implements AgentBridgeTransport {
  eventHandlers: AgentEventHandlers | null = null;
  dispatchResult = deferred<PromptDispatchResponse>();
  dispatchCalls: AgentPromptDispatch[] = [];
  acknowledgements: AgentCanvasAcknowledgementRequest[] = [];
  acknowledgementReceived = deferred<void>();
  restoredStatus: AgentStatusSnapshot | null = null;
  discoveredStatus: AgentStatusSnapshot = status();
  pairingStatus: AgentStatusSnapshot = status({ connection: "paired", paired: true });
  pairingError: Error | null = null;
  pairingResult: Promise<PairingResponse> | null = null;
  discoverCalls = 0;
  pairCalls = 0;
  takeOverCalls = 0;

  async discover(): Promise<AgentStatusSnapshot> {
    this.discoverCalls += 1;
    return this.discoveredStatus;
  }

  async pair(): Promise<PairingResponse> {
    this.pairCalls += 1;
    if (this.pairingError) throw this.pairingError;
    if (this.pairingResult) return this.pairingResult;
    return {
      protocolVersion: 2,
      projectId: "fixture-project",
      origin: window.location.origin,
      sessionToken: "session-token",
      status: this.pairingStatus,
    };
  }

  async takeOver(): Promise<PairingResponse> {
    this.takeOverCalls += 1;
    return {
      protocolVersion: 2,
      projectId: "fixture-project",
      origin: window.location.origin,
      sessionToken: "takeover-session",
      status: this.pairingStatus,
    };
  }

  async restore(): Promise<AgentStatusSnapshot | null> {
    return this.restoredStatus;
  }

  openEvents(_request: unknown, handlers: AgentEventHandlers) {
    this.eventHandlers = handlers;
    return { close: () => undefined };
  }

  async dispatch(request: AgentPromptDispatch): Promise<PromptDispatchResponse> {
    this.dispatchCalls.push(request);
    return this.dispatchResult.promise;
  }

  async acknowledgeCanvasCommand(request: AgentCanvasAcknowledgementRequest): Promise<void> {
    this.acknowledgements.push(request);
    this.acknowledgementReceived.resolve(undefined);
  }

  emitStatus(next: AgentStatusSnapshot): void {
    this.eventHandlers?.onEvent({ type: "status", status: next });
  }

  emitCanvas(command: CanvasCommand): void {
    this.eventHandlers?.onEvent({ type: "canvas-command", command });
  }
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("AgentClient", () => {
  beforeEach(() => {
    setNudgeUiHostDevFlag(true);
    localStorage.clear();
  });

  it("distinguishes a reachable companion from an inactive listener", async () => {
    const transport = new FakeTransport();
    transport.discoveredStatus = status({ connection: "offline", listenerActive: false });
    const client = new AgentClient({
      projectId: "fixture-project",
      origin: window.location.origin,
      transport,
      discoveryIntervalMs: 0,
    });

    client.start();
    await flush();

    expect(client.getSnapshot()).toMatchObject({
      state: "disconnected",
      connection: "offline",
      companionReachable: true,
      listenerActive: false,
    });
  });

  it("pairs a reachable companion before its listener starts", async () => {
    const transport = new FakeTransport();
    transport.discoveredStatus = status({ connection: "offline", listenerActive: false });
    transport.pairingStatus = status({ connection: "paired", listenerActive: false, paired: true });
    const client = new AgentClient({
      projectId: "fixture-project",
      origin: window.location.origin,
      transport,
      discoveryIntervalMs: 0,
    });

    client.start();
    await flush();
    await expect(client.connect()).resolves.toBe(true);

    expect(client.getSnapshot()).toMatchObject({
      state: "connected",
      connection: "paired",
      companionReachable: true,
      paired: true,
      listenerActive: false,
    });
  });

  it("automatically pairs a bridge supplied by the project dev host", async () => {
    const transport = new FakeTransport();
    transport.discoveredStatus = status({ connection: "offline", listenerActive: false });
    transport.pairingStatus = status({ connection: "paired", listenerActive: false, paired: true });
    const client = new AgentClient({
      projectId: "fixture-project",
      origin: window.location.origin,
      transport,
      autoConnect: true,
      discoveryIntervalMs: 0,
    });

    client.start();
    await flush();
    await flush();

    expect(client.getSnapshot()).toMatchObject({
      state: "connected",
      paired: true,
      listenerActive: false,
    });
  });

  it("preserves an explicit disconnect across page client recreation", async () => {
    const firstTransport = new FakeTransport();
    const first = new AgentClient({
      projectId: "fixture-project",
      origin: window.location.origin,
      transport: firstTransport,
      autoConnect: true,
      discoveryIntervalMs: 0,
    });
    first.start();
    await flush();
    await flush();
    expect(first.getSnapshot().paired).toBe(true);
    first.disconnect();
    first.stop();

    const reloadedTransport = new FakeTransport();
    const reloaded = new AgentClient({
      projectId: "fixture-project",
      origin: window.location.origin,
      transport: reloadedTransport,
      autoConnect: true,
      discoveryIntervalMs: 0,
    });
    reloaded.start();
    await flush();
    await flush();

    expect(reloaded.getSnapshot()).toMatchObject({
      paired: false,
      companionReachable: true,
    });
  });

  it("does not adopt another browser tab's pairing without its session token", async () => {
    const transport = new FakeTransport();
    transport.discoveredStatus = status({
      connection: "paired",
      listenerActive: true,
      paired: true,
      request: {
        requestId: "other-tab-request",
        projectId: "fixture-project",
        prompt: "Private prompt from the paired tab",
        status: "working",
      },
    });
    const client = new AgentClient({
      projectId: "fixture-project",
      origin: window.location.origin,
      transport,
      autoConnect: true,
      discoveryIntervalMs: 0,
    });

    client.start();
    await flush();

    expect(client.getSnapshot()).toMatchObject({
      state: "available",
      paired: false,
      pairedElsewhere: true,
      listenerActive: true,
      request: null,
    });
    expect(transport.pairCalls).toBe(0);
  });

  it("takes over a pairing owned by another browser after explicit confirmation", async () => {
    const transport = new FakeTransport();
    transport.discoveredStatus = status({ connection: "paired", paired: true });
    const client = new AgentClient({
      projectId: "fixture-project",
      origin: window.location.origin,
      transport,
      autoConnect: true,
      discoveryIntervalMs: 0,
    });

    client.start();
    await flush();
    expect(client.getSnapshot().pairedElsewhere).toBe(true);

    await expect(client.takeOver()).resolves.toBe(true);
    expect(transport.takeOverCalls).toBe(1);
    expect(client.getSnapshot()).toMatchObject({ paired: true, pairedElsewhere: false });
  });

  it("honors another browser tab's explicit disconnect before auto-connecting", async () => {
    const firstTransport = new FakeTransport();
    const secondTransport = new FakeTransport();
    const first = new AgentClient({
      projectId: "fixture-project",
      origin: window.location.origin,
      transport: firstTransport,
      autoConnect: true,
      discoveryIntervalMs: 0,
    });
    const second = new AgentClient({
      projectId: "fixture-project",
      origin: window.location.origin,
      transport: secondTransport,
      autoConnect: true,
      discoveryIntervalMs: 0,
    });

    first.start();
    await flush();
    await flush();
    first.disconnect();
    second.start();
    await flush();
    await flush();

    expect(second.getSnapshot()).toMatchObject({
      paired: false,
      companionReachable: true,
    });
    expect(secondTransport.pairCalls).toBe(0);
  });

  it("does not dispatch a paired prompt until the listener becomes active", async () => {
    const transport = new FakeTransport();
    transport.discoveredStatus = status({ connection: "offline", listenerActive: false });
    transport.pairingStatus = status({ connection: "paired", listenerActive: false, paired: true });
    const client = new AgentClient({
      projectId: "fixture-project",
      origin: window.location.origin,
      transport,
      discoveryIntervalMs: 0,
    });

    client.start();
    await flush();
    await client.connect();
    await expect(client.dispatchPrompt("Wait for the listener", 21)).resolves.toBeNull();
    expect(transport.dispatchCalls).toHaveLength(0);

    transport.emitStatus(status({ connection: "paired", paired: true, listenerActive: true, request: null }));
    expect(client.getSnapshot()).toMatchObject({ state: "connected", listenerActive: true });

    const dispatch = client.dispatchPrompt("Send after the listener starts", 22);
    expect(client.getSnapshot().state).toBe("working");
    transport.dispatchResult.resolve({
      request: {
        requestId: "listener-ready-request",
        projectId: "fixture-project",
        prompt: "Send after the listener starts",
        changeRevision: 22,
      },
      status: "working",
    });
    await expect(dispatch).resolves.toMatchObject({ status: "working" });
    expect(transport.dispatchCalls).toHaveLength(1);
  });

  it("refreshes discovery when the UI asks to check the connection again", async () => {
    const transport = new FakeTransport();
    transport.discoveredStatus = status({ connection: "offline", listenerActive: false });
    const client = new AgentClient({
      projectId: "fixture-project",
      origin: window.location.origin,
      transport,
      discoveryIntervalMs: 0,
    });

    client.start();
    await flush();
    expect(client.getSnapshot()).toMatchObject({ state: "disconnected", listenerActive: false });

    transport.discoveredStatus = status({ connection: "listening", listenerActive: true });
    await client.checkConnection();

    expect(client.getSnapshot()).toMatchObject({
      state: "available",
      connection: "listening",
      companionReachable: true,
      listenerActive: true,
      paired: false,
    });
  });

  it("drops a stale pairing during Check again while preserving request evidence", async () => {
    const transport = new FakeTransport();
    transport.pairingStatus = status({ connection: "paired", listenerActive: true, paired: true });
    const client = new AgentClient({
      projectId: "fixture-project",
      origin: window.location.origin,
      transport,
      discoveryIntervalMs: 0,
    });

    client.start();
    await flush();
    await client.connect();
    const dispatch = client.dispatchPrompt("Preserve this request", 23);
    expect(client.getSnapshot()).toMatchObject({ request: { status: "working", changeRevision: 23 } });

    transport.restoredStatus = null;
    transport.discoveredStatus = status({ connection: "offline", listenerActive: false });
    await client.checkConnection();

    expect(client.getSnapshot()).toMatchObject({
      companionReachable: true,
      paired: false,
      listenerActive: false,
      request: { status: "working", changeRevision: 23 },
    });
    expect(client.getSnapshot().connection).toBe("working");

    transport.dispatchResult.resolve({
      request: {
        requestId: "stale-pairing-request",
        projectId: "fixture-project",
        prompt: "Preserve this request",
        changeRevision: 23,
      },
      status: "working",
    });
    await dispatch;
  });

  it("keeps an inactive listener state when pairing fails", async () => {
    const transport = new FakeTransport();
    transport.discoveredStatus = status({ connection: "offline", listenerActive: false });
    transport.pairingError = new Error("pairing unavailable");
    const client = new AgentClient({
      projectId: "fixture-project",
      origin: window.location.origin,
      transport,
      discoveryIntervalMs: 0,
    });

    client.start();
    await flush();
    await expect(client.connect()).resolves.toBe(false);

    expect(client.getSnapshot()).toMatchObject({
      state: "disconnected",
      connection: "offline",
      companionReachable: true,
      listenerActive: false,
      paired: false,
      error: "pairing unavailable",
    });
  });

  it("does not cancel pairing when a connection check runs", async () => {
    const transport = new FakeTransport();
    transport.discoveredStatus = status({ connection: "listening", listenerActive: true });
    const pairing = deferred<PairingResponse>();
    transport.pairingResult = pairing.promise;
    const client = new AgentClient({
      projectId: "fixture-project",
      origin: window.location.origin,
      transport,
      discoveryIntervalMs: 0,
    });

    client.start();
    await flush();
    const connecting = client.connect();
    expect(client.getSnapshot().state).toBe("pairing");

    await client.checkConnection();
    expect(transport.discoverCalls).toBe(1);
    pairing.resolve({
      protocolVersion: 2,
      projectId: "fixture-project",
      origin: window.location.origin,
      sessionToken: "session-token",
      status: status({ connection: "paired", paired: true, listenerActive: true }),
    });

    await expect(connecting).resolves.toBe(true);
    expect(client.getSnapshot()).toMatchObject({ state: "connected", paired: true });
  });

  it("discovers, pairs, dispatches one prompt, and returns to connected after re-arm", async () => {
    const transport = new FakeTransport();
    const client = new AgentClient({
      projectId: "fixture-project",
      origin: window.location.origin,
      transport,
      discoveryIntervalMs: 0,
    });

    client.start();
    await flush();
    expect(client.getSnapshot().state).toBe("available");
    await expect(client.connect()).resolves.toBe(true);
    expect(client.getSnapshot().state).toBe("connected");

    const first = client.dispatchPrompt("Change the heading", 12);
    expect(client.getSnapshot().state).toBe("working");
    await expect(client.dispatchPrompt("Do not send twice", 13)).resolves.toBeNull();
    transport.dispatchResult.resolve({
      request: {
        requestId: "server-request",
        projectId: "fixture-project",
        prompt: "Change the heading",
        changeRevision: 12,
      },
      status: "working",
    });
    await first;

    transport.emitStatus(status({
      connection: "paired",
      paired: true,
      listenerActive: false,
      request: {
        requestId: "server-request",
        projectId: "fixture-project",
        prompt: "Change the heading",
        changeRevision: 12,
        status: "completed",
        summary: "Updated source",
      },
    }));
    expect(client.getSnapshot()).toMatchObject({ state: "completed", request: { summary: "Updated source" } });

    transport.emitStatus(status({ connection: "paired", paired: true, listenerActive: true, request: null }));
    expect(client.getSnapshot().state).toBe("connected");
  });

  it("runs and acknowledges a Canvas command through the authenticated client", async () => {
    const transport = new FakeTransport();
    const client = new AgentClient({
      projectId: "fixture-project",
      origin: window.location.origin,
      transport,
      discoveryIntervalMs: 0,
      canvasCommandHandler: async (command) => ({
        commandId: command.commandId,
        ok: true,
        state: { mode: "inspect", groups: [], focusedGroupId: null, focusedRouteUrl: null },
      }),
    });
    client.start();
    await flush();
    await client.connect();

    transport.emitCanvas({ type: "read-state", commandId: "canvas-read" });
    await transport.acknowledgementReceived.promise;

    expect(transport.acknowledgements).toHaveLength(1);
    expect(transport.acknowledgements[0]).toMatchObject({
      sessionToken: "session-token",
      acknowledgement: { commandId: "canvas-read", ok: true },
    });
  });

  it("leaves Canvas acknowledgement to the tab that owns the workspace lease", async () => {
    const transport = new FakeTransport();
    const client = new AgentClient({
      projectId: "fixture-project",
      origin: window.location.origin,
      transport,
      discoveryIntervalMs: 0,
      canvasCommandHandler: async (command) => ({
        commandId: command.commandId,
        ok: false,
        error: { code: "workspace-locked", message: "Another tab owns the workspace." },
      }),
    });
    client.start();
    await flush();
    await client.connect();

    transport.emitCanvas({ type: "read-state", commandId: "canvas-secondary-tab" });
    await flush();

    expect(transport.acknowledgements).toHaveLength(0);
  });

  it("restores a paired stream after a transient disconnect without interrupting its request", async () => {
    vi.useFakeTimers();
    try {
      const transport = new FakeTransport();
      const client = new AgentClient({
        projectId: "fixture-project",
        origin: window.location.origin,
        transport,
        discoveryIntervalMs: 25,
      });
      client.start();
      await flush();
      await client.connect();
      void client.dispatchPrompt("Keep working", 19);
      transport.restoredStatus = status({
        connection: "working",
        paired: true,
        listenerActive: false,
        request: {
          requestId: "restored-request",
          projectId: "fixture-project",
          prompt: "Keep working",
          changeRevision: 19,
          status: "working",
        },
      });

      transport.eventHandlers?.onDisconnect("stream closed");
      expect(client.getSnapshot()).toMatchObject({
        state: "disconnected",
        request: { status: "working" },
      });
      await vi.advanceTimersByTimeAsync(25);

      expect(client.getSnapshot()).toMatchObject({
        state: "working",
        paired: true,
        request: { status: "working", changeRevision: 19 },
      });
      client.stop();
    } finally {
      vi.useRealTimers();
    }
  });
});
