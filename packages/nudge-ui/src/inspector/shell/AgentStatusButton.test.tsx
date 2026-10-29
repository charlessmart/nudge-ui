// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentClientSnapshot } from "../agent/client.ts";
import { AgentStatusButtonView } from "./AgentStatusButton.tsx";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const IDLE_AGENT: AgentClientSnapshot = {
  state: "disabled",
  connection: "offline",
  listenerActive: false,
  companionReachable: false,
  paired: false,
  pairedElsewhere: false,
  request: null,
};

describe("AgentStatusButtonView", () => {
  let host: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
  });

  afterEach(() => {
    act(() => root?.unmount());
    root = null;
    host.remove();
  });

  function render(mcpEnabled?: boolean): { onOpenSettings: ReturnType<typeof vi.fn> } {
    const onOpenSettings = vi.fn();
    root = createRoot(host);
    act(() => root!.render(
      <AgentStatusButtonView
        agent={IDLE_AGENT}
        onOpenSettings={onOpenSettings}
        {...(mcpEnabled === undefined ? {} : { mcpEnabled })}
      />,
    ));
    return { onOpenSettings };
  }

  it("shows only a settings icon and opens the MCP settings by default", () => {
    const { onOpenSettings } = render();

    const button = host.querySelector<HTMLButtonElement>('[data-test="settings-button"]')!;
    expect(button.getAttribute("aria-label")).toBe("Settings");
    expect(button.textContent).toBe("");
    expect(host.querySelector(".agent-status-button__avatar")).toBeNull();
    act(() => button.click());
    expect(onOpenSettings).toHaveBeenCalledWith("mcp");
  });

  it("opens the prompt instructions when MCP is unavailable", () => {
    const { onOpenSettings } = render(false);

    act(() => host.querySelector<HTMLButtonElement>('[data-test="settings-button"]')?.click());
    expect(onOpenSettings).toHaveBeenCalledWith("instructions");
  });
});
