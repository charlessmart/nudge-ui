// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { registerCardFrame, unregisterCardFrame } from "../canvas/projection.ts";
import { hydrateCanvasStore, selectCard } from "../canvas/canvasStore.ts";
import { getConfiguredAgentBridgeEndpoint, HttpAgentBridgeTransport } from "./httpTransport.ts";
import { AGENT_PROTOCOL_VERSION } from "./protocol.ts";

afterEach(() => {
  unregisterCardFrame("bridge-card");
  unregisterCardFrame("bridge-card-a");
  unregisterCardFrame("bridge-card-b");
  hydrateCanvasStore("canvas", [], { x: 0, y: 0, zoom: 1 });
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("reads bridge configuration only from the selected preview", async () => {
  const createFrame = (cardId: string, port?: number): HTMLIFrameElement => {
    const iframe = document.createElement("iframe");
    document.body.append(iframe);
    if (port) {
      const meta = iframe.contentDocument!.createElement("meta");
      meta.name = "nudge-ui-agent-bridge";
      meta.content = `http://127.0.0.1:${port}`;
      iframe.contentDocument!.head.append(meta);
    }
    registerCardFrame(cardId, iframe);
    return iframe;
  };
  createFrame("bridge-card-a", 9876);
  createFrame("bridge-card-b", 8765);
  selectCard("bridge-card-b");

  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    protocolVersion: AGENT_PROTOCOL_VERSION,
    projectId: "project-b",
    origin: window.location.origin,
    status: {
      protocolVersion: AGENT_PROTOCOL_VERSION,
      projectId: "project-b",
      connection: "listening",
      listenerActive: true,
      paired: false,
      request: null,
    },
  })));
  vi.stubGlobal("fetch", fetch);

  await new HttpAgentBridgeTransport().discover({
    projectId: "project-b",
    origin: window.location.origin,
  });

  expect(fetch).toHaveBeenCalledWith(
    expect.objectContaining({ href: expect.stringMatching(/^http:\/\/127\.0\.0\.1:8765\/health\?/) }),
    expect.objectContaining({ method: "GET" }),
  );
});

it("does not borrow bridge configuration from an unrelated preview", () => {
  const configured = document.createElement("iframe");
  const selected = document.createElement("iframe");
  document.body.append(configured, selected);
  const meta = configured.contentDocument!.createElement("meta");
  meta.name = "nudge-ui-agent-bridge";
  meta.content = "http://127.0.0.1:9876";
  configured.contentDocument!.head.append(meta);
  registerCardFrame("bridge-card-a", configured);
  registerCardFrame("bridge-card-b", selected);
  selectCard("bridge-card-b");

  expect(getConfiguredAgentBridgeEndpoint()).toBeUndefined();
});

it("reads agent bridge configuration from a registered shadow-mounted preview", async () => {
  const host = document.createElement("div");
  const iframe = document.createElement("iframe");
  document.body.append(iframe, host);
  const frameDocument = iframe.contentDocument;
  if (!frameDocument) throw new Error("iframe did not initialise");
  const meta = frameDocument.createElement("meta");
  meta.name = "nudge-ui-agent-bridge";
  meta.content = "http://127.0.0.1:9876";
  frameDocument.head.append(meta);
  host.attachShadow({ mode: "open" }).append(iframe);
  registerCardFrame("bridge-card", iframe);
  selectCard("bridge-card");

  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    protocolVersion: AGENT_PROTOCOL_VERSION,
    projectId: "project-a",
    origin: window.location.origin,
    status: {
      protocolVersion: AGENT_PROTOCOL_VERSION,
      projectId: "project-a",
      connection: "listening",
      listenerActive: true,
      paired: false,
      request: null,
    },
  })));
  vi.stubGlobal("fetch", fetch);

  await new HttpAgentBridgeTransport().discover({
    projectId: "project-a",
    origin: window.location.origin,
  });

  expect(fetch).toHaveBeenCalledWith(
    expect.objectContaining({ href: expect.stringMatching(/^http:\/\/127\.0\.0\.1:9876\/health\?/) }),
    expect.objectContaining({ method: "GET" }),
  );
});
