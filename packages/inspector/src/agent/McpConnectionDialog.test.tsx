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

  it("builds a project-scoped command with the README shape", () => {
    expect(createMcpSetupCommand("my-app", "http://localhost:5173")).toBe(
      "npx add-mcp 'npx -y @nudge-ui/mcp@latest --project-id my-app --origin http://localhost:5173 --workspace-root .' --name nudge_ui",
    );
  });

  it("quotes shell syntax in project diagnostics before nesting the command", () => {
    const command = createMcpSetupCommand("client $HOME; echo bad", "http://localhost:5173/$(touch pwned)");

    expect(command).toMatch(/--project-id '\\''client \$HOME; echo bad'\\''/);
    expect(command).toMatch(/--origin '\\''http:\/\/localhost:5173\/\$\(touch pwned\)'\\''/);
    expect(command).toContain("--workspace-root .");
    expect(command).toContain("npx add-mcp '");
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
      .toContain("Connected, not listening");
    expect(document.body.querySelector('[data-test="mcp-connect"]')).toBeNull();
    expect(document.body.querySelector('[data-test="mcp-disconnect"]')).not.toBeNull();
    expect(document.body.querySelector('[data-test="mcp-project-id"]')?.textContent).toBe("fixture-project");
    expect(document.body.querySelector('[data-test="mcp-origin"]')?.textContent).toBe("http://localhost:5173");
    expect(document.body.textContent).toContain("call nudge_listen");
    expect(document.body.querySelectorAll('[data-test^="mcp-step-"]')).toHaveLength(3);
    expect(document.body.querySelector('[data-test="mcp-step-3"]')?.getAttribute("data-complete")).toBe("true");
    expect(document.body.querySelector('[data-test="mcp-step-3"] svg')).not.toBeNull();
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
    expect(document.body.querySelector('[data-test="mcp-step-1"]')?.getAttribute("data-complete")).toBe("true");
    expect(document.body.querySelector('[data-test="mcp-step-2"]')?.getAttribute("data-complete")).toBe("false");
    expect(document.body.querySelector('[data-test="mcp-step-3"]')?.getAttribute("data-complete")).toBe("false");
    act(() => connect!.click());
    expect(onConnect).toHaveBeenCalledOnce();

    act(() => document.body.querySelector<HTMLButtonElement>('[data-test="mcp-check-again"]')!.click());
    await flush();
    expect(onCheckAgain).toHaveBeenCalledOnce();

    act(() => document.body.querySelector<HTMLButtonElement>('[data-test="mcp-copy-command"]')!.click());
    await flush();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("--project-id fixture-project"));

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
