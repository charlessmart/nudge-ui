import { describe, expect, it } from "vitest";
import { AGENT_PROTOCOL_VERSION } from "@nudge-ui/agent-protocol";
import type { StoredProjectSession } from "./project.ts";
import { selectProjectSession } from "./sessionSelection.ts";

const workspace = { workspaceRoot: "/repo", applicationRoot: "/repo" };
const web: StoredProjectSession = {
  schemaVersion: 1,
  protocolVersion: AGENT_PROTOCOL_VERSION,
  sessionId: "web-original",
  projectId: "web",
  workspaceRoot: "/repo",
  appRoot: "/repo/apps/web",
  branch: "feature",
  origin: "http://localhost:5173",
  endpoint: "http://127.0.0.1:12345",
  startedAt: "2026-09-18T00:00:00.000Z",
  pid: 123,
  controlToken: "test-token",
};
const admin = { ...web, sessionId: "admin", appRoot: "/repo/apps/admin" };

describe("project session selection", () => {
  it("selects the only app from the workspace root", () => {
    expect(selectProjectSession([web], workspace)).toBe(web);
  });

  it("requires an explicit choice when multiple apps are running", () => {
    expect(() => selectProjectSession([web, admin], workspace)).toThrow("Several Nudge apps");
    expect(selectProjectSession([web, admin], { ...workspace, requestedSessionId: admin.sessionId })).toBe(admin);
  });

  it("never selects another worktree, even on the same branch", () => {
    const otherWorktree = { ...web, workspaceRoot: "/other", appRoot: "/other/apps/web" };
    expect(() => selectProjectSession([otherWorktree], workspace)).toThrow("No live Nudge project session matches this exact workspace");
    expect(() => selectProjectSession([otherWorktree], {
      ...workspace, requestedSessionId: otherWorktree.sessionId,
    })).toThrow("not live in this exact workspace");
  });

  it("limits an app-scoped adapter to its own application", () => {
    const scope = { ...workspace, applicationRoot: web.appRoot };
    expect(selectProjectSession([web, admin], scope)).toBe(web);
    expect(() => selectProjectSession([admin], scope)).toThrow("No live Nudge project session matches this exact application");
    expect(() => selectProjectSession([web, admin], {
      ...scope, requestedSessionId: admin.sessionId,
    })).toThrow("not live for this exact application");
  });

  it("keeps the current selection when another app starts", () => {
    expect(selectProjectSession([admin, web], { ...workspace, previousSession: web })).toBe(web);
  });

  it("allows an explicit choice to replace the previous selection", () => {
    expect(selectProjectSession([web, admin], {
      ...workspace, previousSession: web, requestedSessionId: admin.sessionId,
    })).toBe(admin);
  });

  it("reconnects to a single replacement of the same app", () => {
    const restarted = { ...web, sessionId: "web-restarted" };
    expect(selectProjectSession([admin, restarted], { ...workspace, previousSession: web })).toBe(restarted);
  });

  it("does not switch to a sibling when the selected app disappears", () => {
    expect(() => selectProjectSession([admin], { ...workspace, previousSession: web }))
      .toThrow("The previously selected Nudge app is no longer running");
  });

  it("requires an explicit choice between multiple replacements", () => {
    const first = { ...web, sessionId: "web-first" };
    const second = { ...web, sessionId: "web-second" };
    const options = { ...workspace, previousSession: web };
    expect(() => selectProjectSession([first, second], options)).toThrow("Several restarted Nudge sessions");
    expect(selectProjectSession([first, second], { ...options, requestedSessionId: second.sessionId })).toBe(second);
  });

  it("explains when no development server is running", () => {
    expect(() => selectProjectSession([], workspace)).toThrow("Start the project development server first");
  });
});
