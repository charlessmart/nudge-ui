import { describe, expect, it } from "vitest";
import {
  AGENT_PROTOCOL_LIMITS,
  AGENT_PROTOCOL_VERSION,
  canonicalOrigin,
  decodeAgentStatusSnapshot,
  decodeBridgeEvent,
  decodePairingResponse,
  decodePromptDispatchResponse,
  deriveConnectionState,
  isAgentPromptRequest,
  isAllowedOrigin,
  isCanvasCommand,
  isCanvasCommandResult,
  isSameOriginRoute,
  validateSketchAttachments,
  validateRoutes,
} from "./index.ts";

describe("agent protocol public contracts", () => {
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

describe("agent wire decoders", () => {
  const request = { requestId: "request-1", projectId: "project-1", prompt: "Update the card" };
  const snapshot = {
    protocolVersion: AGENT_PROTOCOL_VERSION,
    projectId: "project-1",
    connection: "paired",
    listenerActive: true,
    paired: true,
    request: null,
  };

  it("recomputes the connection state from the snapshot's own fields", () => {
    expect(decodeAgentStatusSnapshot({ ...snapshot, connection: "offline" })?.connection).toBe("paired");
    expect(decodeAgentStatusSnapshot({
      ...snapshot,
      request: { ...request, status: "working" },
    })?.connection).toBe("working");
  });

  it("rejects snapshots from another protocol version or with a malformed request", () => {
    expect(decodeAgentStatusSnapshot({ ...snapshot, protocolVersion: 1 })).toBeNull();
    expect(decodeAgentStatusSnapshot({ ...snapshot, protocolVersion: 2 })).toBeNull();
    expect(decodeAgentStatusSnapshot({ ...snapshot, connection: "busy" })).toBeNull();
    expect(decodeAgentStatusSnapshot({ ...snapshot, request: { ...request, status: "stuck" } })).toBeNull();
    expect(decodeAgentStatusSnapshot({ ...snapshot, request: { ...request, status: "working", extra: 1 } })).toBeNull();
  });

  it("drops unknown snapshot fields and bounds the agent client name", () => {
    const decoded = decodeAgentStatusSnapshot({ ...snapshot, agentClientName: "a".repeat(500), secret: "x" });
    expect(decoded?.agentClientName).toHaveLength(AGENT_PROTOCOL_LIMITS.agentClientName);
    expect(decoded).not.toHaveProperty("secret");
  });

  it("passes Canvas commands through for controller validation but validates other events", () => {
    expect(decodeBridgeEvent({ type: "canvas-command", command: { type: "bogus" } }))
      .toEqual({ type: "canvas-command", command: { type: "bogus" } });
    expect(decodeBridgeEvent({ type: "status", status: { ...snapshot, paired: "yes" } })).toBeNull();
    expect(decodeBridgeEvent({ type: "activity", activity: { requestId: "r", file: "/etc/passwd", operation: "read" } }))
      .toBeNull();
    expect(decodeBridgeEvent({ type: "shutdown" })).toBeNull();
  });

  it("accepts a pairing only for the requested project and origin", () => {
    const pairing = {
      protocolVersion: AGENT_PROTOCOL_VERSION,
      projectId: "project-1",
      origin: "http://localhost:5173",
      sessionToken: "token-1",
      status: snapshot,
    };
    const expected = { projectId: "project-1", origin: "http://localhost:5173" };
    expect(decodePairingResponse(pairing, expected)?.sessionToken).toBe("token-1");
    expect(decodePairingResponse({ ...pairing, origin: "http://evil.test" }, expected)).toBeNull();
    expect(decodePromptDispatchResponse({ request, status: "delivered" }, "project-1")).toEqual({ request, status: "delivered" });
    expect(decodePromptDispatchResponse({ request, status: "working" }, "project-1")?.request).toEqual(request);
    expect(decodePromptDispatchResponse({ request, status: "working" }, "project-2")).toBeNull();
  });

  it("rejects a successful Canvas result that carries an error", () => {
    expect(isCanvasCommandResult({ commandId: "c", ok: false, error: { code: "renderer-error", message: "" } })).toBe(true);
    expect(isCanvasCommandResult({ commandId: "c", ok: true, error: { code: "renderer-error", message: "" } })).toBe(false);
    expect(isCanvasCommandResult({ commandId: "c", ok: true, state: { mode: "bogus" } })).toBe(false);
  });

  it("derives working before paired before listening", () => {
    expect(deriveConnectionState({ listenerActive: false, paired: true, request: { ...request, status: "delivered" } })).toBe("delivered");
    expect(decodeAgentStatusSnapshot({ protocolVersion: AGENT_PROTOCOL_VERSION, projectId: "project-1", connection: "delivered", listenerActive: false, paired: true, request: { ...request, status: "delivered" } })?.request?.status).toBe("delivered");
    expect(deriveConnectionState({ listenerActive: true, paired: true, request: { ...request, status: "working" } }))
      .toBe("working");
    expect(deriveConnectionState({ listenerActive: true, paired: true, request: { ...request, status: "completed" } }))
      .toBe("paired");
    expect(deriveConnectionState({ listenerActive: true, paired: false, request: null })).toBe("listening");
    expect(deriveConnectionState({ listenerActive: false, paired: false, request: null })).toBe("offline");
  });
});
