// @vitest-environment jsdom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it } from "vitest";
import type { AgentClientSnapshot } from "../agent/client.ts";
import { AgentStatusButtonView } from "./AgentStatusButton.tsx";

let agent: AgentClientSnapshot;

function renderButton(): HTMLElement {
  const host = document.createElement("div");
  host.innerHTML = renderToStaticMarkup(createElement(AgentStatusButtonView, { agent, onOpenSettings: () => undefined }));
  return host;
}

describe("AgentStatusButton avatars", () => {
  beforeEach(() => {
    agent = {
      state: "connected", connection: "paired", paired: true, pairedElsewhere: false,
      listenerActive: false, companionReachable: true, request: null,
    };
  });

  it.each([
    ["codex-mcp-client", "Codex"], ["Claude Code", "Claude"], ["cursor-vscode", "Cursor"],
  ])("shows only the %s client logo while connected", (name, label) => {
    agent = { ...agent, agentClientName: name };
    const host = renderButton();
    expect(host.querySelectorAll(".agent-status-button__avatar")).toHaveLength(1);
    expect(host.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe(label);
    expect(host.querySelector(".agent-status-button__avatar .tabler-icon-robot")).toBeNull();
    expect(host.textContent).toBe("MCP");
  });

  it.each([undefined, "unrecognized-client", "mycodexclone"])("uses a robot for an unknown client %s", (name) => {
    agent = { ...agent, agentClientName: name };
    const host = renderButton();
    expect(host.querySelectorAll(".agent-status-button__avatar")).toHaveLength(1);
    expect(host.querySelector(".agent-status-button__avatar .tabler-icon-robot")).not.toBeNull();
    expect(host.querySelector('[role="img"]')?.getAttribute("aria-label")).toBe("Agent");
  });

  it("keeps the default three avatars when disconnected", () => {
    agent = { ...agent, paired: false, agentClientName: "codex-mcp-client" };
    const host = renderButton();
    expect(host.querySelectorAll(".agent-status-button__avatar")).toHaveLength(3);
    expect(host.textContent).toBe("Settings");
  });
});
