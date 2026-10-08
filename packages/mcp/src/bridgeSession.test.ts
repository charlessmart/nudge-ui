import { describe, expect, it } from "vitest";
import type { AgentSketchAttachment, BridgeEnvelope } from "@nudge-ui/agent-protocol";
import {
  AGENT_CLAIM_TIMEOUT_MS,
  BridgeSessionError,
  createBridgeSession,
  type BridgeClock,
  type BridgeSessionOptions,
  type BrowserStream,
  type PromptDispatchInput,
} from "./bridgeSession.ts";

const ORIGIN = "http://localhost:5173";
const ALIAS = "http://127.0.0.1:5173";

class FakeClock implements BridgeClock {
  private nextHandle = 0;
  private time = 0;
  private readonly callbacks = new Map<number, { at: number; callback: () => void }>();

  now(): number { return this.time; }

  get pendingCount(): number { return this.callbacks.size; }

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

class RecordingStream implements BrowserStream {
  readonly envelopes: BridgeEnvelope[] = [];
  ended = false;

  constructor(private readonly open = true) {}

  send(envelope: BridgeEnvelope): boolean {
    this.envelopes.push(envelope);
    return this.open;
  }

  end(): void { this.ended = true; }

  eventTypes(): string[] {
    return this.envelopes.map(({ event }) => event.type);
  }
}

function createSession(overrides: Partial<BridgeSessionOptions> = {}) {
  let tokens = 0;
  let ids = 0;
  return createBridgeSession({
    projectId: "site",
    origin: ORIGIN,
    allowedOrigins: [ALIAS],
    clock: new FakeClock(),
    tokenFactory: () => `token-${++tokens}`,
    idFactory: () => `id-${++ids}`,
    ...overrides,
  });
}

function errorCode(action: () => unknown): string | undefined {
  try {
    action();
  } catch (error) {
    return error instanceof BridgeSessionError ? error.code : `unexpected ${String(error)}`;
  }
  return undefined;
}

const prompt: PromptDispatchInput = { prompt: "Tighten the hero spacing", attachments: [] };

describe("bridge session pairing", () => {
  it("pairs a configured alias and then accepts only that origin with the issued token", () => {
    const session = createSession();

    expect(errorCode(() => session.pairBrowser("http://evil.test"))).toBe("origin_not_allowed");
    const pairing = session.pairBrowser(ALIAS, `${ALIAS}/pricing#plans`);

    expect(pairing).toMatchObject({ origin: ALIAS, sessionToken: "token-1", pageUrl: `${ALIAS}/pricing#plans` });
    expect(session.authorizeBrowser(ALIAS, "token-1")).toEqual({ origin: ALIAS, sessionToken: "token-1" });
    expect(errorCode(() => session.authorizeBrowser(ORIGIN, "token-1"))).toBe("origin_mismatch");
    expect(errorCode(() => session.authorizeBrowser(ALIAS, "token-2"))).toBe("invalid_session");
  });

  it("rejects a page URL from another origin", () => {
    const session = createSession();

    expect(errorCode(() => session.pairBrowser(ORIGIN, "http://evil.test/steal"))).toBe("invalid_page_url");
    expect(session.getStatus().paired).toBe(false);
  });

  it("refreshes the page for the current token and refuses a second browser", () => {
    const session = createSession();
    session.pairBrowser(ORIGIN, `${ORIGIN}/a`);

    const refreshed = session.pairBrowser(ORIGIN, `${ORIGIN}/b`, "token-1");

    expect(refreshed).toMatchObject({ sessionToken: "token-1", pageUrl: `${ORIGIN}/b` });
    expect(session.getStatus().pageUrl).toBe(`${ORIGIN}/b`);
    expect(errorCode(() => session.pairBrowser(ORIGIN))).toBe("already_paired");
  });

  it("takes over a pairing by revoking the old browser and interrupting its request", async () => {
    const session = createSession();
    session.pairBrowser(ORIGIN);
    const oldStream = new RecordingStream();
    session.attachStream(oldStream);
    const listening = session.waitForPrompt();
    session.dispatchPrompt(prompt);
    await listening;

    const replacement = session.takeOver(ORIGIN);

    expect(replacement.sessionToken).toBe("token-2");
    expect(oldStream.ended).toBe(true);
    expect(oldStream.eventTypes()).toContain("disconnected");
    expect(session.getStatus().request).toMatchObject({ requestId: "id-1", status: "interrupted" });
    expect(errorCode(() => session.authorizeBrowser(ORIGIN, "token-1"))).toBe("invalid_session");
  });
});

describe("bridge session prompt handoff", () => {
  it("delivers one prompt to one listener and keeps the outcome until the agent listens again", async () => {
    const session = createSession();
    session.pairBrowser(ORIGIN);
    const listening = session.waitForPrompt({ agentClientName: "  codex  " });

    expect(session.getStatus()).toMatchObject({ connection: "paired", listenerActive: true, agentClientName: "codex" });
    await expect(session.waitForPrompt()).rejects.toMatchObject({ code: "listener_active" });
    expect(session.dispatchPrompt({ ...prompt, changeRevision: 7 })).toMatchObject({ status: "delivered" });
    await expect(listening).resolves.toMatchObject({ requestId: "id-1", prompt: prompt.prompt, changeRevision: 7 });
    expect(errorCode(() => session.dispatchPrompt(prompt))).toBe("listener_unavailable");
    await expect(session.waitForPrompt()).resolves.toMatchObject({ requestId: "id-1", changeRevision: 7 });

    expect(session.getStatus()).toMatchObject({ connection: "delivered", request: { status: "delivered" } });
    expect(session.getRequest("id-1")).toMatchObject({ prompt: prompt.prompt, requestId: "id-1" });
    expect(errorCode(() => session.getRequest("wrong-id"))).toBe("unknown_request");
    session.updateRequestStatus({ requestId: "id-1", status: "working" });
    expect(session.getStatus()).toMatchObject({ connection: "working", request: { status: "working" } });
    expect(errorCode(() => session.getRequest("id-1"))).toBe("unknown_request");
    await expect(session.waitForPrompt()).rejects.toMatchObject({ code: "request_in_flight" });
    session.updateRequestStatus({ requestId: "id-1", status: "completed", summary: "Done" });
    expect(errorCode(() => session.updateRequestStatus({ requestId: "id-1", status: "working" }))).toBe("inactive_request");
    expect(session.getStatus().request).toMatchObject({ status: "completed", summary: "Done" });
    void session.waitForPrompt();
    expect(session.getStatus().request).toBeNull();
  });

  it("interrupts an unacknowledged delivery at its original deadline and permits rearming", async () => {
    const clock = new FakeClock();
    const session = createSession({ clock });
    session.pairBrowser(ORIGIN);
    const stream = new RecordingStream();
    session.attachStream(stream);
    const listening = session.waitForPrompt();
    session.dispatchPrompt(prompt);
    await listening;
    clock.advance(59_999);
    await expect(session.waitForPrompt()).resolves.toMatchObject({ requestId: "id-1" });
    expect(session.getStatus().request?.status).toBe("delivered");
    clock.advance(1);
    expect(session.getStatus().request).toMatchObject({ requestId: "id-1", status: "interrupted", error: "The agent did not acknowledge this request within 60 seconds. Ask the agent to listen again, then resend the prompt." });
    expect(stream.envelopes.at(-1)?.event).toMatchObject({ type: "status", status: { request: { status: "interrupted" } } });
    expect(errorCode(() => session.getRequest("id-1"))).toBe("unknown_request");
    expect(errorCode(() => session.updateRequestStatus({ requestId: "id-1", status: "working" }))).toBe("inactive_request");
    const next = session.waitForPrompt();
    expect(session.getStatus()).toMatchObject({ listenerActive: true, request: null });
    session.dispatchPrompt({ ...prompt, prompt: "Retry the spacing change" });
    await expect(next).resolves.toMatchObject({ requestId: "id-2" });
    session.close();
  });

  it("does not interrupt acknowledged work when the delivery deadline passes", async () => {
    const clock = new FakeClock();
    const session = createSession({ clock });
    session.pairBrowser(ORIGIN);
    const listening = session.waitForPrompt();
    session.dispatchPrompt(prompt);
    await listening;
    clock.advance(59_999);
    session.updateRequestStatus({ requestId: "id-1", status: "working" });
    expect(clock.pendingCount).toBe(0);
    clock.advance(60_000);
    expect(session.getStatus().request?.status).toBe("working");
    session.close();
  });

  it("does not let an old delivery timer interrupt a newer request", async () => {
    const clock = new FakeClock();
    const session = createSession({ clock });
    session.pairBrowser(ORIGIN);
    const first = session.waitForPrompt();
    session.dispatchPrompt(prompt);
    await first;
    clock.advance(30_000);
    session.disconnectBrowser("token-1");
    expect(clock.pendingCount).toBe(0);
    session.pairBrowser(ORIGIN);
    const second = session.waitForPrompt();
    session.dispatchPrompt(prompt);
    await second;
    clock.advance(30_000);
    expect(session.getStatus().request).toMatchObject({ requestId: "id-2", status: "delivered" });
    session.close();
    expect(clock.pendingCount).toBe(0);
    clock.advance(60_000);
  });

  it("delivers sketch bytes to the agent but reports only their metadata", async () => {
    const session = createSession();
    session.pairBrowser(ORIGIN);
    const listening = session.waitForPrompt();
    const attachment: AgentSketchAttachment = {
      id: "sketch-1",
      revision: 1,
      filename: "sketch-1.png",
      mimeType: "image/png",
      width: 1,
      height: 1,
      byteSize: 3,
      data: "AAAA",
      capture: {
        url: `${ORIGIN}/`,
        title: "Home",
        timestamp: 0,
        viewportWidth: 1280,
        viewportHeight: 800,
        scrollX: 0,
        scrollY: 0,
        devicePixelRatio: 1,
        host: "vite",
        framework: "react",
      },
    };

    const dispatched = session.dispatchPrompt({ ...prompt, attachments: [attachment] });

    expect(dispatched.request.sketches?.[0]).not.toHaveProperty("data");
    expect(session.getStatus().request?.sketches?.[0]).not.toHaveProperty("data");
    expect(session.getRequest(dispatched.request.requestId).attachments).toEqual([attachment]);
    await expect(session.waitForPrompt()).resolves.toMatchObject({ requestId: dispatched.request.requestId, attachments: [attachment] });
    await expect(listening).resolves.toMatchObject({ attachments: [{ id: "sketch-1", data: "AAAA" }] });
  });

  it("stops listening when the listener's signal aborts", async () => {
    const session = createSession();
    session.pairBrowser(ORIGIN);
    const abort = new AbortController();
    const listening = session.waitForPrompt({ signal: abort.signal });

    abort.abort();

    await expect(listening).rejects.toMatchObject({ code: "listener_aborted" });
    expect(session.getStatus().listenerActive).toBe(false);
    expect(errorCode(() => session.dispatchPrompt(prompt))).toBe("listener_unavailable");
  });

  it("publishes activity only for the working request", async () => {
    const session = createSession();
    session.pairBrowser(ORIGIN);
    const stream = new RecordingStream();
    session.attachStream(stream);
    const listening = session.waitForPrompt();
    session.dispatchPrompt(prompt);
    await listening;

    expect(errorCode(() => session.reportActivity({ requestId: "other", operation: "read", file: "src/App.tsx" })))
      .toBe("inactive_request");
    session.updateRequestStatus({ requestId: "id-1", status: "working" });
    session.reportActivity({ requestId: "id-1", operation: "read", file: "src/App.tsx" });
    session.updateRequestStatus({ requestId: "id-1", status: "completed" });

    expect(stream.eventTypes().filter((type) => type === "activity")).toHaveLength(1);
    expect(errorCode(() => session.reportActivity({ requestId: "id-1", operation: "read", file: "src/App.tsx" })))
      .toBe("inactive_request");
  });
});

describe("bridge session streams", () => {
  it("requires a pairing before a stream attaches", () => {
    const session = createSession();

    expect(errorCode(() => session.attachStream(new RecordingStream()))).toBe("invalid_session");
  });

  it("greets each stream with status and stops writing to a closed stream", () => {
    const session = createSession();
    session.pairBrowser(ORIGIN);
    const open = new RecordingStream();
    const closed = new RecordingStream(false);
    session.attachStream(open);
    session.attachStream(closed);

    void session.waitForPrompt();

    expect(open.eventTypes()).toEqual(["status", "status"]);
    expect(closed.eventTypes()).toEqual(["status"]);
    expect(open.envelopes.every(({ sessionToken }) => sessionToken === "token-1")).toBe(true);
  });
});

describe("bridge session Canvas commands", () => {
  it("requires a paired browser and same-origin routes", async () => {
    const session = createSession();
    const routes = { type: "present-routes", groupId: "agent-directions", label: "Directions" } as const;

    await expect(session.dispatchCanvasCommand({ ...routes, routes: [{ url: `${ORIGIN}/a` }] }))
      .rejects.toMatchObject({ code: "browser_unpaired" });
    session.pairBrowser(ORIGIN);
    await expect(session.dispatchCanvasCommand({ ...routes, routes: [{ url: "http://evil.test/a" }] }))
      .rejects.toMatchObject({ code: "invalid_routes" });
  });

  it("resolves a command only from its own acknowledgement", async () => {
    const session = createSession();
    session.pairBrowser(ORIGIN);
    const stream = new RecordingStream();
    session.attachStream(stream);

    const result = session.dispatchCanvasCommand({ type: "fit-all", commandId: "fit-1" });

    expect(stream.envelopes.at(-1)?.event).toMatchObject({ type: "canvas-command", command: { commandId: "fit-1" } });
    await expect(session.dispatchCanvasCommand({ type: "fit-all" })).rejects.toMatchObject({ code: "command_in_flight" });
    expect(errorCode(() => session.acknowledgeCanvas({ commandId: "fit-2", ok: true }))).toBe("unknown_command");
    session.acknowledgeCanvas({ commandId: "fit-1", ok: true });
    await expect(result).resolves.toEqual({ commandId: "fit-1", ok: true });
    expect(errorCode(() => session.acknowledgeCanvas({ commandId: "fit-1", ok: true }))).toBe("no_command");
  });

  it("resolves a bounded timeout when the browser never acknowledges", async () => {
    const clock = new FakeClock();
    const session = createSession({ clock, commandTimeoutMs: 10 });
    session.pairBrowser(ORIGIN);

    const result = session.dispatchCanvasCommand({ type: "fit-all", commandId: "fit-1" });
    clock.advance(10);

    await expect(result).resolves.toMatchObject({ ok: false, error: { code: "ack_timeout" } });
    expect(errorCode(() => session.acknowledgeCanvas({ commandId: "fit-1", ok: true }))).toBe("no_command");
  });
});

describe("bridge session agent claim", () => {
  it("keeps a confirmed claim and expires an abandoned one", async () => {
    const clock = new FakeClock();
    const session = createSession({ clock });
    session.claimAgent("agent-a");
    const listening = session.waitForPrompt();

    clock.advance(AGENT_CLAIM_TIMEOUT_MS - 1);
    session.confirmAgent("agent-a");
    clock.advance(AGENT_CLAIM_TIMEOUT_MS - 1);
    expect(errorCode(() => session.claimAgent("agent-b"))).toBe("session_claimed");
    clock.advance(1);

    await expect(listening).rejects.toMatchObject({ code: "listener_cancelled" });
    expect(session.agentClaimed).toBe(false);
    session.claimAgent("agent-b");
    expect(session.agentClaimed).toBe(true);
  });

  it("releases only for the owner and interrupts its work", async () => {
    const session = createSession();
    session.pairBrowser(ORIGIN);
    session.claimAgent("agent-a");
    const listening = session.waitForPrompt();
    session.dispatchPrompt(prompt);
    await listening;
    const command = session.dispatchCanvasCommand({ type: "read-state" });

    expect(errorCode(() => session.releaseAgent("agent-b"))).toBe("agent_not_owner");
    session.releaseAgent("agent-a");

    expect(session.agentClaimed).toBe(false);
    expect(session.getStatus().request).toMatchObject({ status: "interrupted" });
    await expect(command).resolves.toMatchObject({ ok: false, error: { code: "agent_released" } });
  });
});

describe("bridge session shutdown", () => {
  it("interrupts work and settles a pending command when the browser disconnects", async () => {
    const session = createSession();
    session.pairBrowser(ORIGIN);
    const stream = new RecordingStream();
    session.attachStream(stream);
    const listening = session.waitForPrompt();
    session.dispatchPrompt(prompt);
    await listening;
    const command = session.dispatchCanvasCommand({ type: "read-state" });

    expect(errorCode(() => session.disconnectBrowser("token-2"))).toBe("invalid_session");
    session.disconnectBrowser("token-1");

    expect(session.getStatus()).toMatchObject({ paired: false, pageUrl: null, request: { status: "interrupted" } });
    expect(stream.eventTypes().at(-1)).toBe("disconnected");
    expect(stream.ended).toBe(true);
    await expect(command).resolves.toMatchObject({ ok: false, error: { code: "browser_disconnected" } });
  });

  it("cancels the listener on close and refuses new work", async () => {
    const session = createSession();
    session.pairBrowser(ORIGIN);
    const listening = session.waitForPrompt();

    session.close();

    await expect(listening).rejects.toMatchObject({ code: "listener_cancelled" });
    await expect(session.waitForPrompt()).rejects.toMatchObject({ code: "session_closed" });
    await expect(session.dispatchCanvasCommand({ type: "fit-all" })).rejects.toMatchObject({ code: "session_closed" });
  });
});
