// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyPromptButton } from "./CopyPromptButton.tsx";
import { configureAgentBridgeTransport, resetAgentClients } from "./agent/client.ts";
import type {
  AgentBridgeTransport,
  AgentEventHandlers,
  AgentPromptDispatch,
  AgentStatusSnapshot,
  PairingResponse,
  PromptDispatchResponse,
} from "./agent/protocol.ts";
import { clearChanges, loadChanges, type ElementChangeRecord } from "./changesLog.ts";
import { setNudgeUiHostDevFlag } from "./devFlag.ts";
import { configureNudgeUiRuntime, getNudgeUiRuntimeConfig } from "./runtimeConfig.ts";
import {
  clearClipboardHandoff,
  getClipboardHandoffSnapshot,
} from "./prompt/clipboardHandoff.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function listeningStatus(overrides: Partial<AgentStatusSnapshot> = {}): AgentStatusSnapshot {
  return {
    protocolVersion: 1,
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

  async discover(): Promise<AgentStatusSnapshot | null> { return this.discoveredStatus; }

  async pair(): Promise<PairingResponse> {
    return {
      protocolVersion: 1,
      projectId: "handoff-project",
      origin: window.location.origin,
      sessionToken: "button-session",
      status: listeningStatus({ connection: "paired", paired: true }),
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
    clearChanges();
    clearClipboardHandoff();
    configureNudgeUiRuntime(previousConfig);
    container.remove();
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
    expect(status?.textContent).toContain("Ready to connect");
    expect(status?.textContent).toContain("Connect");
    expect(status?.className).toContain("status-callout--accent");

    act(() => status?.querySelector<HTMLButtonElement>('[data-test="agent-status-action"]')?.click());
    expect(document.body.querySelector('[data-test="mcp-connection-dialog"]')?.textContent)
      .toContain("Ready to connect");
  });

  it("shows no connection status when the companion is not found", async () => {
    const transport = new ButtonTransport();
    transport.discoveredStatus = null;
    configureAgentBridgeTransport(transport);
    act(() => root.render(<CopyPromptButton />));
    await flush();

    expect(container.querySelector('[data-test="agent-connection-status"]')).toBeNull();
  });

  it("shows setup for a paired page whose agent is not listening", async () => {
    const transport = new ButtonTransport();
    transport.discoveredStatus = listeningStatus({ connection: "paired", listenerActive: false, paired: true });
    configureAgentBridgeTransport(transport);
    act(() => root.render(<CopyPromptButton />));
    await flush();

    const status = container.querySelector<HTMLElement>('[data-test="agent-connection-status"]');
    expect(status?.textContent).toContain("Connected, not listening");
    expect(status?.textContent).toContain("Set up");
    expect(status?.querySelector<HTMLButtonElement>('[data-test="agent-status-action"]')?.dataset.action)
      .toBe("setup");
  });

  it("shows a centered listening status with a check icon", async () => {
    const transport = new ButtonTransport();
    configureAgentBridgeTransport(transport);
    act(() => root.render(<CopyPromptButton />));
    await flush();

    const status = container.querySelector<HTMLElement>('[data-test="agent-connection-status"]');
    expect(status?.textContent).toContain("Agent listening");
    expect(status?.className).not.toContain("status-callout");
    expect(status?.querySelector("svg")).not.toBeNull();
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

    act(() => loadChanges([change()]));
    expect(button.disabled).toBe(false);
    await act(async () => { button.click(); });

    expect(transport.dispatches).toHaveLength(1);
    expect(transport.dispatches[0]?.prompt).toContain("src/Heading.tsx");
    expect(button.textContent).toContain("Agent working");
    expect(button.disabled).toBe(true);
  });

  it("falls back to the clipboard when the paired listener rejects dispatch", async () => {
    const transport = new ButtonTransport();
    transport.rejectDispatch = true;
    configureAgentBridgeTransport(transport);
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    act(() => {
      loadChanges([change()]);
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
