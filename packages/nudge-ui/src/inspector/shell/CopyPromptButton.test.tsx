// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyPromptButton } from "./CopyPromptButton.tsx";
import { configureAgentBridgeTransport, resetAgentClients } from "../agent/client.ts";
import type {
  AgentBridgeTransport,
  AgentEventHandlers,
  AgentPromptDispatch,
  AgentStatusSnapshot,
  PairingResponse,
  PromptDispatchResponse,
} from "../agent/protocol.ts";
import { clearWorkspace, restoreChangeRecords, type ElementChangeRecord } from "../changes/changesLog.ts";
import { recordAgentDispatch, resetAgentVerification } from "../agent/verification.ts";
import { setNudgeUiHostDevFlag } from "../runtime/devFlag.ts";
import { getSketches, initializeSketchStore, markSketchesDispatching, markSketchesHandingOff, resetSketchStore, saveSketch } from "../sketch/store.ts";
import { resetSketchMemory } from "../sketch/persistence.ts";
import { toAgentSketchMetadata } from "../sketch/model.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "../runtime/runtimeConfig.ts";
import {
  clearClipboardHandoff,
  getClipboardHandoffSnapshot,
} from "../prompt/clipboardHandoff.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function listeningStatus(overrides: Partial<AgentStatusSnapshot> = {}): AgentStatusSnapshot {
  return {
    protocolVersion: 2,
    projectId: "handoff-project",
    connection: "listening",
    listenerActive: true,
    paired: false,
    request: null,
    ...overrides,
  };
}

function change(): ElementChangeRecord {
  return {
    cid: "Heading",
    file: "src/Heading.tsx",
    line: 2,
    selector: '[data-cid="Heading"]',
    property: "color",
    oldToken: null,
    newToken: null,
    oldRawValue: "black",
    rawValue: "red",
    source: { file: "src/Heading.tsx", line: 2, component: "Heading" },
  };
}

class ButtonTransport implements AgentBridgeTransport {
  eventHandlers: AgentEventHandlers | null = null;
  dispatches: AgentPromptDispatch[] = [];
  rejectDispatch = false;
  discoveredStatus: AgentStatusSnapshot | null = listeningStatus();
  pairingStatus: AgentStatusSnapshot = listeningStatus({ connection: "paired", paired: true });
  takeOvers = 0;

  async discover(): Promise<AgentStatusSnapshot | null> { return this.discoveredStatus; }

  async pair(): Promise<PairingResponse> {
    return {
      protocolVersion: 2,
      projectId: "handoff-project",
      origin: window.location.origin,
      sessionToken: "button-session",
      status: this.pairingStatus,
    };
  }

  async takeOver(): Promise<PairingResponse> {
    this.takeOvers += 1;
    return {
      protocolVersion: 2,
      projectId: "handoff-project",
      origin: window.location.origin,
      sessionToken: "replacement-session",
      status: this.pairingStatus,
    };
  }

  openEvents(_request: unknown, handlers: AgentEventHandlers) {
    this.eventHandlers = handlers;
    return { close() {} };
  }

  async dispatch(request: AgentPromptDispatch): Promise<PromptDispatchResponse> {
    this.dispatches.push(request);
    if (this.rejectDispatch) throw new Error("listener disappeared");
    return {
      request: {
        requestId: "button-request",
        projectId: request.projectId,
        prompt: request.prompt,
        changeRevision: request.changeRevision,
      },
      status: "working",
    };
  }
}

async function flush(): Promise<void> {
  await act(async () => { await Promise.resolve(); });
}

describe("CopyPromptButton agent handoff", () => {
  let container: HTMLDivElement;
  let root: Root;
  let previousConfig: ReturnType<typeof getNudgeUiRuntimeConfig>;

  beforeEach(() => {
    setNudgeUiHostDevFlag(true);
    localStorage.clear();
    clearClipboardHandoff();
    resetAgentVerification();
    resetSketchStore();
    resetSketchMemory();
    previousConfig = getNudgeUiRuntimeConfig();
    configureNudgeUiRuntime({ ...previousConfig, projectId: "handoff-project" });
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    configureAgentBridgeTransport(undefined);
    resetAgentClients();
    clearWorkspace();
    clearClipboardHandoff();
    resetAgentVerification();
    resetSketchStore();
    resetSketchMemory();
    configureNudgeUiRuntime(previousConfig);
    container.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows a connection action when the companion is ready but no agent listener is active", async () => {
    const transport = new ButtonTransport();
    transport.discoveredStatus = listeningStatus({ connection: "offline", listenerActive: false });
    configureAgentBridgeTransport(transport);
    act(() => root.render(<CopyPromptButton />));
    await flush();

    const button = container.querySelector<HTMLButtonElement>('[data-test="copy-prompt"]')!;
    const status = container.querySelector<HTMLElement>('[data-test="agent-connection-status"]');
    expect(button.textContent).toContain("Copy prompt");
    expect(status?.textContent).toContain("Project available · Connect this page");
    expect(status?.textContent).toContain("Connect");
    expect(status?.className).toContain("status-callout--accent");

    act(() => status?.querySelector<HTMLButtonElement>('[data-test="agent-status-action"]')?.click());
    expect(document.body.querySelector('[data-test="mcp-connection-dialog"]')?.textContent)
      .toContain("Project available · Connect this page");
  });

  it("shows no connection status when the companion is not found", async () => {
    const transport = new ButtonTransport();
    transport.discoveredStatus = null;
    configureAgentBridgeTransport(transport);
    act(() => root.render(<CopyPromptButton />));
    await flush();

    expect(container.querySelector('[data-test="agent-connection-status"]')).toBeNull();
  });

  it("offers takeover inline when another browser owns the MCP pairing", async () => {
    const transport = new ButtonTransport();
    transport.discoveredStatus = listeningStatus({ connection: "paired", paired: true });
    configureAgentBridgeTransport(transport);
    act(() => root.render(<CopyPromptButton />));
    await flush();

    const status = container.querySelector<HTMLElement>('[data-test="agent-connection-status"]');
    expect(status?.textContent).toContain("MCP active in another tab or window");
    expect(status?.querySelector<HTMLButtonElement>('[data-test="agent-status-action"]')?.textContent)
      .toContain("Take over");

    await act(async () => {
      status?.querySelector<HTMLButtonElement>('[data-test="agent-status-action"]')?.click();
    });
    expect(transport.takeOvers).toBe(1);
    expect(container.querySelector('[data-test="agent-connection-status"]')).toBeNull();
  });

  it("shows the current change count on the prompt button", async () => {
    const transport = new ButtonTransport();
    transport.discoveredStatus = null;
    configureAgentBridgeTransport(transport);
    act(() => {
      restoreChangeRecords([change(), { ...change(), property: "background-color" }]);
      root.render(<CopyPromptButton />);
    });
    await flush();

    expect(container.querySelector('[data-test="copy-prompt-change-count"]')?.textContent).toBe("2");

    act(() => restoreChangeRecords([change()]));
    expect(container.querySelector('[data-test="copy-prompt-change-count"]')?.textContent).toBe("1");

    act(() => restoreChangeRecords([]));
    expect(container.querySelector('[data-test="copy-prompt-change-count"]')).toBeNull();
  });

  it("shows the connected status without a setup action when the agent is not listening", async () => {
    const transport = new ButtonTransport();
    transport.discoveredStatus = listeningStatus({ connection: "offline", listenerActive: false });
    transport.pairingStatus = listeningStatus({ connection: "paired", listenerActive: false, paired: true });
    configureAgentBridgeTransport(transport);
    act(() => root.render(<CopyPromptButton />));
    await flush();

    act(() => container
      .querySelector<HTMLButtonElement>('[data-test="agent-status-action"]')
      ?.click());
    const connect = document.body.querySelector<HTMLButtonElement>('[data-test="mcp-connect"]')!;
    await act(async () => { connect.click(); });

    const status = container.querySelector<HTMLElement>('[data-test="agent-connection-status"]');
    expect(status?.textContent).toContain("Project connected · Ask agent to listen");
    expect(status?.textContent).not.toContain("Set up");
    expect(status?.querySelector<HTMLButtonElement>('[data-test="agent-status-action"]')).toBeNull();
  });

  it("shows a listening indicator on the primary button", async () => {
    const transport = new ButtonTransport();
    configureAgentBridgeTransport(transport);
    act(() => root.render(<CopyPromptButton />));
    await flush();

    const button = container.querySelector<HTMLButtonElement>('[data-test="copy-prompt"]');
    expect(button?.dataset.agentListening).toBe("true");
    expect(button?.querySelector('[data-test="agent-listening-indicator"]')?.getAttribute("aria-label"))
      .toBe("Agent listening");
    expect(container.querySelector('[data-test="agent-connection-status"]')).toBeNull();
  });

  it("changes Connect into Send and disables the control while one prompt is working", async () => {
    const transport = new ButtonTransport();
    configureAgentBridgeTransport(transport);
    act(() => root.render(<CopyPromptButton />));
    await flush();
    const button = container.querySelector<HTMLButtonElement>('[data-test="copy-prompt"]')!;
    expect(button.textContent).toContain("Connect agent");

    await act(async () => { button.click(); });
    expect(button.textContent).toContain("Send prompt");
    expect(button.disabled).toBe(true);

    act(() => restoreChangeRecords([change()]));
    expect(button.disabled).toBe(false);
    await act(async () => { button.click(); });

    expect(transport.dispatches).toHaveLength(1);
    expect(transport.dispatches[0]?.prompt).toContain("src/Heading.tsx");
    expect(button.textContent).toContain("Agent working");
    expect(button.disabled).toBe(true);
  });

  it("sends the available prompt from Shift+S", async () => {
    const transport = new ButtonTransport();
    configureAgentBridgeTransport(transport);
    act(() => root.render(<CopyPromptButton />));
    await flush();

    const button = container.querySelector<HTMLButtonElement>('[data-test="copy-prompt"]')!;
    await act(async () => { button.click(); });
    act(() => restoreChangeRecords([change()]));

    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "KeyS",
      key: "s",
      shiftKey: true,
    });
    await act(async () => {
      window.dispatchEvent(event);
      await Promise.resolve();
    });

    expect(event.defaultPrevented).toBe(true);
    expect(transport.dispatches).toHaveLength(1);
    expect(transport.dispatches[0]?.prompt).toContain("src/Heading.tsx");
  });

  it("leaves Shift+S available to focused text inputs", async () => {
    const transport = new ButtonTransport();
    configureAgentBridgeTransport(transport);
    act(() => root.render(<CopyPromptButton />));
    await flush();

    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    const event = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "KeyS",
      key: "s",
      shiftKey: true,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(transport.dispatches).toHaveLength(0);
    input.remove();
  });

  it("removes a submitted sketch when the agent event stream reports completion", async () => {
    await initializeSketchStore("handoff-project");
    const image = new Blob(["png"], { type: "image/png" });
    const sketch = await saveSketch({
      description: "Align the heading",
      capture: {
        url: window.location.href, title: "Fixture", timestamp: 1,
        viewportWidth: 800, viewportHeight: 600, scrollX: 0, scrollY: 0,
        devicePixelRatio: 1, host: "vite-react", framework: "React", imageWidth: 1, imageHeight: 1,
      },
      strokes: [], imageWidth: 1, imageHeight: 1, originalImage: image, annotatedImage: image,
    });
    await markSketchesDispatching([sketch], 42, "sketch-batch");
    await markSketchesHandingOff([sketch], 42, "sketch-batch", "sketch-request");
    const transport = new ButtonTransport();
    configureAgentBridgeTransport(transport);
    act(() => root.render(<CopyPromptButton />));
    await flush();
    const button = container.querySelector<HTMLButtonElement>('[data-test="copy-prompt"]')!;
    await act(async () => { button.click(); });
    expect(transport.eventHandlers).not.toBeNull();

    await act(async () => {
      transport.eventHandlers?.onEvent({
        type: "status",
        status: listeningStatus({
          connection: "paired", paired: true,
          request: {
            requestId: "sketch-request", projectId: "handoff-project", prompt: "Align the heading",
            changeRevision: 42, clientDispatchId: "sketch-batch",
            sketches: [toAgentSketchMetadata(sketch)], status: "completed",
          },
        }),
      });
    });

    expect(getSketches()).toEqual([]);
    expect(button.disabled).toBe(true);
  });

  it("distinguishes verified agent completion from the still-pending preview", async () => {
    const transport = new ButtonTransport();
    configureAgentBridgeTransport(transport);
    act(() => root.render(<CopyPromptButton />));
    await flush();
    const button = container.querySelector<HTMLButtonElement>('[data-test="copy-prompt"]')!;
    await act(async () => { button.click(); });

    const target = document.createElement("h1");
    target.dataset.cid = "Heading";
    document.body.append(target);
    const authored = document.createElement("style");
    authored.textContent = '[data-cid="Heading"] { color: red; }';
    document.head.append(authored);

    act(() => restoreChangeRecords([change()]));
    await act(async () => { button.click(); });
    const revision = transport.dispatches[0]?.changeRevision;
    expect(revision).toBeDefined();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    act(() => {
      transport.eventHandlers?.onEvent({
        type: "status",
        status: listeningStatus({
          connection: "paired",
          paired: true,
          request: {
            requestId: "button-request",
            projectId: "handoff-project",
            prompt: "Change the heading",
            changeRevision: revision,
            status: "completed",
          },
        }),
      });
    });
    expect(transport.eventHandlers).not.toBeNull();
    expect(button.dataset.agentState).toBe("completed");
    await flush();
    await flush();

    expect(container.querySelector('[data-test="agent-verified-hint"]')?.textContent)
      .toBe("Agent changes verified.");
    expect(container.querySelector('[data-test="agent-completed-hint"]')).toBeNull();
    expect(container.querySelector('[data-test="copy-prompt"]')?.textContent).toContain("Send prompt");
  });

  it("reports completed-but-unverified work while preserving remaining edits", async () => {
    document.head.querySelectorAll("style").forEach((el) => el.remove());
    document.body.querySelectorAll("[data-cid]").forEach((el) => el.remove());
    const transport = new ButtonTransport();
    configureAgentBridgeTransport(transport);
    act(() => root.render(<CopyPromptButton />));
    await flush();
    const button = container.querySelector<HTMLButtonElement>('[data-test="copy-prompt"]')!;
    await act(async () => { button.click(); });

    const target = document.createElement("h1");
    target.dataset.cid = "Heading";
    document.body.append(target);

    act(() => restoreChangeRecords([change()]));
    await act(async () => { button.click(); });
    const revision = transport.dispatches[0]?.changeRevision;
    expect(revision).toBeDefined();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    act(() => {
      transport.eventHandlers?.onEvent({
        type: "status",
        status: listeningStatus({
          connection: "paired",
          paired: true,
          request: {
            requestId: "button-request",
            projectId: "handoff-project",
            prompt: "Change the heading",
            changeRevision: revision,
            status: "completed",
          },
        }),
      });
    });
    expect(button.dataset.agentState).toBe("completed");
    await flush();
    await flush();

    expect(container.querySelector('[data-test="agent-verified-hint"]')).toBeNull();
    expect(container.querySelector('[data-test="agent-completed-hint"]')).toBeNull();
  });

  it("shows plain completion when nothing was in flight", async () => {
    document.head.querySelectorAll("style").forEach((el) => el.remove());
    document.body.querySelectorAll("[data-cid]").forEach((el) => el.remove());
    const transport = new ButtonTransport();
    configureAgentBridgeTransport(transport);
    act(() => root.render(<CopyPromptButton />));
    await flush();
    const button = container.querySelector<HTMLButtonElement>('[data-test="copy-prompt"]')!;
    await act(async () => { button.click(); });
    expect(transport.eventHandlers).not.toBeNull();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });

    const revision = 987_654;
    act(() => restoreChangeRecords([]));
    recordAgentDispatch(revision, []);
    act(() => {
      transport.eventHandlers?.onEvent({
        type: "status",
        status: listeningStatus({
          connection: "paired",
          paired: true,
          request: {
            requestId: "empty-request",
            projectId: "handoff-project",
            prompt: "No edits",
            changeRevision: revision,
            status: "completed",
          },
        }),
      });
    });
    await flush();
    await flush();

    expect(container.querySelector('[data-test="agent-verified-hint"]')).toBeNull();
    expect(container.querySelector('[data-test="agent-completed-hint"]')).toBeNull();
  });

  it("falls back to the clipboard when the paired listener rejects dispatch", async () => {
    const transport = new ButtonTransport();
    transport.rejectDispatch = true;
    configureAgentBridgeTransport(transport);
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    act(() => {
      restoreChangeRecords([change()]);
      root.render(<CopyPromptButton />);
    });
    await flush();
    const button = container.querySelector<HTMLButtonElement>('[data-test="copy-prompt"]')!;
    await act(async () => { button.click(); });
    await act(async () => { button.click(); });

    expect(writeText).toHaveBeenCalledOnce();
    expect(button.textContent).toContain("Copied");
    expect(getClipboardHandoffSnapshot()).toMatchObject({
      changes: [{ key: expect.any(String), fingerprint: expect.any(String) }],
      structuralChanges: [],
    });
  });

});
