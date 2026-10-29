import { afterEach, describe, expect, it, vi } from "vitest";
import { beginAgentActivity, endAgentActivity, getAgentActivity, reportAgentActivity } from "./agentActivity.ts";

afterEach(() => { endAgentActivity("activity-test"); vi.useRealTimers(); });
describe("temporary agent activity", () => {
  it("pins the frames a handoff covers", () => {
    const target = { kind: "application" as const, route: "http://localhost/playground" };
    beginAgentActivity("activity-test", ["frame-1", "frame-2"], target);
    expect(getAgentActivity("activity-test").targets).toEqual(["frame-1", "frame-2"]);
    expect(getAgentActivity("activity-test").target).toEqual(target);
  });
  it("ignores reports before a session starts and keeps one file per path", () => {
    reportAgentActivity("activity-test", { file: "src/Card.tsx", operation: "edit" });
    expect(getAgentActivity("activity-test")).toEqual({ sessionId: null, targets: [], target: undefined, files: [] });
    beginAgentActivity("activity-test", []);
    reportAgentActivity("activity-test", { file: "src/Card.tsx", operation: "read" });
    reportAgentActivity("activity-test", { file: "src/Card.tsx", operation: "edit", line: 4, endLine: 9 });
    expect(getAgentActivity("activity-test").files.map((file) => file.operation)).toEqual(["edit"]);
  });
  it("expires file attribution while the session stays open", () => {
    vi.useFakeTimers();
    beginAgentActivity("activity-test", []);
    reportAgentActivity("activity-test", { file: "src/Card.tsx", operation: "read" });
    reportAgentActivity("activity-test", { file: "src/Header.tsx", operation: "edit", line: 10, endLine: 20 });
    vi.advanceTimersByTime(8_000);
    expect(getAgentActivity("activity-test").files.map((file) => file.file)).toEqual(["src/Header.tsx"]);
    vi.advanceTimersByTime(4_000);
    expect(getAgentActivity("activity-test").files).toEqual([]);
    expect(getAgentActivity("activity-test").sessionId).not.toBeNull();
  });
  it("clears decoration when the session ends and rejects late operations", () => {
    beginAgentActivity("activity-test", []);
    reportAgentActivity("activity-test", { file: "src/Card.tsx", operation: "edit" });
    endAgentActivity("activity-test");
    reportAgentActivity("activity-test", { file: "src/Card.tsx", operation: "edit" });
    expect(getAgentActivity("activity-test")).toEqual({ sessionId: null, targets: [], target: undefined, files: [] });
  });
});
