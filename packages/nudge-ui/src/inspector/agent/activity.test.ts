import { afterEach, describe, expect, it, vi } from "vitest";
import { beginActivityDispatch, getAgentActivity, reportAgentActivity, synchronizeAgentActivity } from "./activity.ts";

afterEach(() => { synchronizeAgentActivity("activity-test", undefined, false); vi.useRealTimers(); });
describe("temporary agent activity", () => {
  it("decorates the submitted frames only for the matching dispatch", () => {
    const target = { kind: "application" as const, route: "http://localhost/playground" };
    beginActivityDispatch("activity-test", "dispatch-1", ["frame-1", "frame-2"], target);
    synchronizeAgentActivity("activity-test", "request-1", true, "dispatch-1");
    expect(getAgentActivity("activity-test").targets).toEqual(["frame-1", "frame-2"]);
    expect(getAgentActivity("activity-test").target).toEqual(target);
    reportAgentActivity("activity-test", { requestId: "old-request", file: "src/Card.tsx", operation: "edit" });
    expect(getAgentActivity("activity-test").files).toEqual([]);
    synchronizeAgentActivity("activity-test", "request-2", true, "other-dispatch");
    expect(getAgentActivity("activity-test").targets).toEqual([]);
    expect(getAgentActivity("activity-test").target).toBeUndefined();
  });
  it("expires file attribution while the request remains working", () => {
    vi.useFakeTimers();
    synchronizeAgentActivity("activity-test", "request-1", true);
    reportAgentActivity("activity-test", { requestId: "request-1", file: "src/Card.tsx", operation: "read" });
    reportAgentActivity("activity-test", { requestId: "request-1", file: "src/Header.tsx", operation: "edit", line: 10, endLine: 20 });
    vi.advanceTimersByTime(8_000);
    expect(getAgentActivity("activity-test").files.map((file) => file.file)).toEqual(["src/Header.tsx"]);
    vi.advanceTimersByTime(4_000);
    expect(getAgentActivity("activity-test").files).toEqual([]);
    expect(getAgentActivity("activity-test").requestId).toBe("request-1");
  });
  it("clears decoration at completion and rejects late operations", () => {
    synchronizeAgentActivity("activity-test", "request-1", true);
    reportAgentActivity("activity-test", { requestId: "request-1", file: "src/Card.tsx", operation: "edit" });
    synchronizeAgentActivity("activity-test", "request-1", false);
    reportAgentActivity("activity-test", { requestId: "request-1", file: "src/Card.tsx", operation: "edit" });
    expect(getAgentActivity("activity-test")).toEqual({ requestId: null, targets: [], files: [] });
  });
});
