// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentClientSnapshot } from "./client.ts";
import {
  createMcpSetupCommand,
  McpConnectionDialog,
} from "./McpConnectionDialog.tsx";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

function snapshot(overrides: Partial<AgentClientSnapshot> = {}): AgentClientSnapshot {
  return {
    state: "disconnected",
    connection: "offline",
    listenerActive: false,
    companionReachable: false,
    paired: false,
    request: null,
    ...overrides,
  };
}

async function flush(): Promise<void> {
  await act(async () => { await Promise.resolve(); });
}

describe("McpConnectionDialog", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    host.remove();
    vi.restoreAllMocks();
  });

  it("uses the guided application setup command", () => {
    expect(createMcpSetupCommand()).toBe("npx nudge-ui agent setup");
  });

  it("shows a paired idle companion as not listening until the listener is active", () => {
    act(() => {
      root.render(
        <McpConnectionDialog
          open
          projectId="fixture-project"
          origin="http://localhost:5173"
          snapshot={snapshot({ paired: true, connection: "paired" })}
          onOpenChange={() => undefined}
          onConnect={() => undefined}
          onDisconnect={() => undefined}
          onCheckAgain={async () => undefined}
        />,
      );
    });

    const dialog = document.body.querySelector<HTMLElement>('[data-test="mcp-connection-dialog"]');
    expect(dialog?.getAttribute("role")).toBe("dialog");
    expect(document.body.querySelector('[data-test="mcp-connection-status"]')?.textContent)
      .toContain("Project connected · Ask agent to listen");
    expect(document.body.querySelector('[data-test="mcp-connect"]')).toBeNull();
    expect(document.body.querySelector('[data-test="mcp-disconnect"]')).not.toBeNull();
    expect(document.body.querySelector('[data-test="mcp-project-id"]')?.textContent).toBe("fixture-project");
    expect(document.body.querySelector('[data-test="mcp-origin"]')?.textContent).toBe("http://localhost:5173");
    expect(document.body.textContent).toContain("Listen to Nudge");
    expect(document.body.querySelector('[data-test="mcp-setup-tab-ai"]')?.getAttribute("data-active")).toBe("true");
    expect(document.body.querySelector('[data-test="mcp-setup-tab-terminal"]')?.getAttribute("data-active")).toBe("false");
    expect(document.body.querySelector('[data-test="mcp-setup-tabs"]')?.firstElementChild?.getAttribute("data-test"))
      .toBe("mcp-setup-tab-ai");
    expect(document.body.querySelector('[data-test="mcp-setup-prompt"]')).not.toBeNull();
    expect(document.body.querySelector('[data-test="mcp-setup-command"]')).toBeNull();
    expect(document.body.querySelector(".mcp-connection__note")).toBeNull();
    expect(document.body.querySelectorAll('[data-test^="mcp-step-"]')).toHaveLength(2);
    expect(document.body.querySelector('[data-test="mcp-step-2"]')?.getAttribute("data-complete")).toBe("false");
  });

  it("offers idle pairing and connection recovery as rendered actions", async () => {
    const onConnect = vi.fn(() => Promise.resolve(true));
    const onDisconnect = vi.fn();
    const onCheckAgain = vi.fn(() => Promise.resolve());

    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });

    act(() => {
      root.render(
        <McpConnectionDialog
          open
          projectId="fixture-project"
          origin="http://localhost:5173"
          snapshot={snapshot({
            companionReachable: true,
          })}
          onOpenChange={() => undefined}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          onCheckAgain={onCheckAgain}
        />,
      );
    });

    const connect = document.body.querySelector<HTMLButtonElement>('[data-test="mcp-connect"]');
    expect(connect).not.toBeNull();
    expect(document.body.querySelector('[data-test="mcp-step-1"]')?.getAttribute("data-complete")).toBe("false");
    expect(document.body.querySelector('[data-test="mcp-step-2"]')?.getAttribute("data-complete")).toBe("false");
    act(() => connect!.click());
    expect(onConnect).toHaveBeenCalledOnce();

    act(() => document.body.querySelector<HTMLButtonElement>('[data-test="mcp-check-again"]')!.click());
    await flush();
    expect(onCheckAgain).toHaveBeenCalledOnce();

    act(() => document.body.querySelector<HTMLButtonElement>('[data-test="mcp-setup-tab-terminal"]')!.click());
    act(() => document.body.querySelector<HTMLButtonElement>('[data-test="mcp-copy-command"]')!.click());
    await flush();
    expect(writeText).toHaveBeenCalledWith("npx nudge-ui agent setup");

    act(() => document.body.querySelector<HTMLButtonElement>('[data-test="mcp-setup-tab-ai"]')!.click());
    expect(document.body.querySelector('[data-test="mcp-setup-prompt"]')?.textContent)
      .toContain("Please set up the Nudge coding-agent integration");
    expect(document.body.querySelector('[data-test="mcp-setup-command"]')).toBeNull();
    act(() => document.body.querySelector<HTMLButtonElement>('[data-test="mcp-copy-setup-prompt"]')!.click());
    await flush();
    expect(writeText).toHaveBeenLastCalledWith(expect.stringContaining("npx nudge-ui agent setup"));

    act(() => {
      root.render(
        <McpConnectionDialog
          open
          projectId="fixture-project"
          origin="http://localhost:5173"
          snapshot={snapshot({ paired: true, connection: "paired" })}
          onOpenChange={() => undefined}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
          onCheckAgain={onCheckAgain}
        />,
      );
    });
    act(() => document.body.querySelector<HTMLButtonElement>('[data-test="mcp-disconnect"]')!.click());
    expect(onDisconnect).toHaveBeenCalledOnce();
  });
});
