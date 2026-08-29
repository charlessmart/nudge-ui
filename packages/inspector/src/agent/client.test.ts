// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { setNudgeUiHostDevFlag } from "../devFlag.ts";
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
    protocolVersion: 1,
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

  async discover(): Promise<AgentStatusSnapshot> {
    return this.discoveredStatus;
  }

  async pair(): Promise<PairingResponse> {
    return {
      protocolVersion: 1,
      projectId: "fixture-project",
      origin: window.location.origin,
      sessionToken: "session-token",
      status: status({ connection: "paired", paired: true }),
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
