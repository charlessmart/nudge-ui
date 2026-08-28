import { describe, expect, it } from "vitest";
import {
  canonicalOrigin,
  defaultBridgePort,
  isAgentPromptRequest,
  isAllowedOrigin,
  isCanvasCommand,
  isSameOriginRoute,
  validateRoutes,
} from "./index.ts";

describe("agent protocol public contracts", () => {
  it("derives a stable high loopback port from a project identity", () => {
    expect(defaultBridgePort("sandbox")).toBe(defaultBridgePort("sandbox"));
    expect(defaultBridgePort("sandbox")).toBeGreaterThanOrEqual(30_000);
    expect(defaultBridgePort("sandbox")).toBeLessThanOrEqual(49_999);
  });
  it("canonicalizes only bare HTTP(S) origins", () => {
    expect(canonicalOrigin("http://localhost:5173")).toBe("http://localhost:5173");
    expect(canonicalOrigin("https://example.test/")).toBe("https://example.test");
    expect(canonicalOrigin("https://example.test/app")).toBeNull();
    expect(canonicalOrigin("https://user:secret@example.test")).toBeNull();
  });

  it("requires an explicit allow-list instead of treating an empty list as wildcard", () => {
    expect(isAllowedOrigin("http://localhost:5173", [])).toBe(false);
    expect(isAllowedOrigin("http://localhost:5173", ["http://localhost:5173/"])).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:5173", ["http://localhost:5173"])).toBe(false);
  });

  it("normalizes relative same-origin routes while rejecting cross-origin routes", () => {
    expect(isSameOriginRoute({ url: "/second#hero", title: "Second" }, "http://localhost:5173")).toBe(true);
    expect(isSameOriginRoute({ url: "https://evil.test/" }, "http://localhost:5173")).toBe(false);
    expect(validateRoutes([{ url: "/second", label: "Second route" }], "http://localhost:5173")).toEqual([
      { url: "http://localhost:5173/second", label: "Second route" },
    ]);
  });

  it("keeps prompt validation bounded and rejects unknown fields", () => {
    expect(isAgentPromptRequest({
      requestId: "request-1",
      projectId: "project-1",
      prompt: "Update the card",
      changeRevision: 4,
    })).toBe(true);
    expect(isAgentPromptRequest({
      requestId: "request-1",
      projectId: "project-1",
      prompt: "Update the card",
      extra: "not part of the protocol",
    })).toBe(false);
  });

  it("accepts only the narrow Canvas command vocabulary", () => {
    expect(isCanvasCommand({ type: "fit-all", commandId: "command-1" })).toBe(true);
    expect(isCanvasCommand({ type: "remove-group", commandId: "command-2", groupId: "agent-1" })).toBe(true);
    expect(isCanvasCommand({ type: "delete-everything", commandId: "command-3" })).toBe(false);
  });
});
