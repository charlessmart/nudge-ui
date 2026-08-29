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
  discoveredStatus = listeningStatus();

  async discover(): Promise<AgentStatusSnapshot> { return this.discoveredStatus; }

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
    configureNudgeUiRuntime(previousConfig);
    container.remove();
    vi.restoreAllMocks();
  });

  it("explains when the companion is reachable but no agent listener is active", async () => {
    const transport = new ButtonTransport();
    transport.discoveredStatus = listeningStatus({ connection: "offline", listenerActive: false });
    configureAgentBridgeTransport(transport);
    act(() => root.render(<CopyPromptButton />));
    await flush();

    const button = container.querySelector<HTMLButtonElement>('[data-test="copy-prompt"]')!;
    const hint = container.querySelector<HTMLElement>('[data-test="agent-listener-hint"]');
    expect(button.textContent).toContain("Copy prompt");
    expect(hint?.textContent).toContain("nudge_listen");
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
  });
});
