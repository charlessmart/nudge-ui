import { describe, expect, it } from "vitest";
import {
  canonicalOrigin,
  defaultBridgePort,
  isAgentPromptRequest,
  isAllowedOrigin,
  isCanvasCommand,
  isSameOriginRoute,
  validateSketchAttachments,
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

  it("validates bounded sketch metadata and attachment batches", () => {
    const data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
    const attachment = {
      id: "sketch-1",
      revision: 1,
      filename: "sketch-sketch-1-r1.png",
      mimeType: "image/png",
      width: 1,
      height: 1,
      byteSize: 68,
      capture: {
        url: "http://localhost:5173/",
        title: "Fixture",
        timestamp: 1,
        viewportWidth: 800,
        viewportHeight: 600,
        scrollX: 0,
        scrollY: 0,
        devicePixelRatio: 1,
        host: "vite-react",
        framework: "React",
      },
      annotations: [{ number: 1, description: "Done button" }],
      data,
    };
    expect(validateSketchAttachments([attachment])).toEqual([attachment]);
    const { data: _data, ...metadata } = attachment;
    expect(isAgentPromptRequest({
      requestId: "request-1",
      projectId: "project-1",
      prompt: "Review the screenshot",
      sketches: [metadata],
    })).toBe(true);
    expect(isAgentPromptRequest({
      requestId: "request-1",
      projectId: "project-1",
      prompt: "Review the screenshot",
      sketches: [attachment],
    })).toBe(false);
    expect(() => validateSketchAttachments([{ ...attachment, byteSize: 67 }])).toThrow();
    expect(() => validateSketchAttachments([{ ...attachment, data: `${data}AAAA` }])).toThrow();
  });
});
