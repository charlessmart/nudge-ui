// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  connectFrame,
  measureFrameViewport,
  PROJECT_ID,
  toViewportPoint,
  toViewportRect,
  WORKSPACE_ID,
} from "./frameConnection.ts";
import { PROTOCOL_VERSION } from "./frameProtocol.ts";
import { registerCardFrameSource, unregisterCardFrame } from "./projection.ts";
import { subscribeCanvasRendererMessages, type CanvasRendererMessage } from "./rendererMessageRouter.ts";
import { RENDERER_ELEMENT_ID_ATTR } from "./rendererCidIndex.ts";

function mountFrame(rendered: { left: number; top: number; width: number; height: number }, layoutWidth: number): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  document.body.append(iframe);
  Object.defineProperty(iframe, "clientWidth", { configurable: true, value: layoutWidth });
  iframe.getBoundingClientRect = () => DOMRect.fromRect({ x: rendered.left, y: rendered.top, width: rendered.width, height: rendered.height });
  return iframe;
}

function addRendererElement(iframe: HTMLIFrameElement, elementId: string, cid: string, src: string): HTMLElement {
  const doc = iframe.contentDocument!;
  const element = doc.createElement("div");
  element.setAttribute(RENDERER_ELEMENT_ID_ATTR, elementId);
  element.setAttribute("data-cid", cid);
  element.setAttribute("data-src", src);
  doc.body.append(element);
  return element;
}

afterEach(() => {
  unregisterCardFrame("card-1");
  document.body.replaceChildren();
});

describe("frame viewport", () => {
  it("measures scale from the rendered width over the layout width", () => {
    const iframe = mountFrame({ left: 100, top: 50, width: 400, height: 300 }, 800);

    const viewport = measureFrameViewport(iframe);

    expect(viewport).toMatchObject({ left: 100, top: 50, width: 400, height: 300 });
    expect(viewport.scale).toBeCloseTo(0.5);
  });

  it("falls back to scale 1 before the frame has layout", () => {
    const iframe = mountFrame({ left: 10, top: 20, width: 0, height: 0 }, 0);

    expect(measureFrameViewport(iframe).scale).toBe(1);
  });

  it("maps frame points into controller coordinates", () => {
    const viewport = { left: 100, top: 50, width: 600, height: 450, scale: 1.5 };

    expect(toViewportPoint(viewport, { x: 40, y: 30 })).toEqual({ x: 160, y: 95 });
  });

  it("keeps an unscaled guide thickness while scaling its length", () => {
    const viewport = { left: 100, top: 80, width: 250, height: 150, scale: 0.5 };

    expect(toViewportRect(viewport, { left: 20, top: 40, width: 200, height: 2 }, { width: true, height: false }))
      .toEqual({ left: 110, top: 100, width: 100, height: 2 });
  });
});

describe("frame element lookup", () => {
  it("returns the element when its renderer ID and source identity match", () => {
    const iframe = mountFrame({ left: 0, top: 0, width: 800, height: 600 }, 800);
    const element = addRendererElement(iframe, "r7", "cid-a", "src/App.tsx:4:1");

    expect(connectFrame("card-1", iframe).element({ elementId: "r7", cid: "cid-a", src: "src/App.tsx:4:1" })).toBe(element);
  });

  it("rejects a renderer ID carried by two elements", () => {
    const iframe = mountFrame({ left: 0, top: 0, width: 800, height: 600 }, 800);
    addRendererElement(iframe, "r7", "cid-a", "src/App.tsx:4:1");
    addRendererElement(iframe, "r7", "cid-a", "src/App.tsx:4:1");

    expect(connectFrame("card-1", iframe).element({ elementId: "r7", cid: "cid-a", src: "src/App.tsx:4:1" })).toBeNull();
  });

  it("rejects an element whose source identity changed", () => {
    const iframe = mountFrame({ left: 0, top: 0, width: 800, height: 600 }, 800);
    addRendererElement(iframe, "r7", "cid-a", "src/App.tsx:4:1");
    const frame = connectFrame("card-1", iframe);

    expect(frame.element({ elementId: "r7", cid: "cid-b", src: "src/App.tsx:4:1" })).toBeNull();
    expect(frame.element({ elementId: "r7", cid: "cid-a", src: "src/Other.tsx:1:1" })).toBeNull();
  });

  it("rejects an element ID outside the renderer ID format", () => {
    const iframe = mountFrame({ left: 0, top: 0, width: 800, height: 600 }, 800);
    addRendererElement(iframe, "r7\"] , [data-cid", "cid-a", "");

    expect(connectFrame("card-1", iframe).element({ elementId: "r7\"] , [data-cid", cid: "cid-a", src: "" })).toBeNull();
  });
});

describe("frame posting", () => {
  it("adds the protocol envelope and targets the controller origin", () => {
    const iframe = mountFrame({ left: 0, top: 0, width: 800, height: 600 }, 800);
    const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => undefined);

    connectFrame("card-1", iframe).post({ type: "measure-modifier", altKey: true });

    expect(postMessage).toHaveBeenCalledWith({
      type: "measure-modifier",
      altKey: true,
      protocolVersion: PROTOCOL_VERSION,
      projectId: window.location.origin,
      workspaceId: WORKSPACE_ID,
      cardId: "card-1",
    }, window.location.origin);
  });
});

describe("renderer message routing", () => {
  function deliver(iframe: HTMLIFrameElement, data: Record<string, unknown>): CanvasRendererMessage[] {
    const received: CanvasRendererMessage[] = [];
    const stop = subscribeCanvasRendererMessages((routed) => received.push(routed));
    window.dispatchEvent(new MessageEvent("message", { data, origin: window.location.origin, source: iframe.contentWindow }));
    stop();
    return received;
  }

  const envelope = { protocolVersion: PROTOCOL_VERSION, projectId: PROJECT_ID, workspaceId: WORKSPACE_ID, cardId: "card-1" };

  it("delivers a known message with the sending frame's connection", () => {
    const iframe = mountFrame({ left: 0, top: 0, width: 800, height: 600 }, 800);
    registerCardFrameSource("card-1", iframe);

    const received = deliver(iframe, { ...envelope, type: "frame-ready" });

    expect(received).toHaveLength(1);
    expect(received[0]?.message.type).toBe("frame-ready");
    expect(received[0]?.frame.cardId).toBe("card-1");
    expect(received[0]?.frame.iframe).toBe(iframe);
  });

  it("drops a message type outside the renderer protocol", () => {
    const iframe = mountFrame({ left: 0, top: 0, width: 800, height: 600 }, 800);
    registerCardFrameSource("card-1", iframe);

    expect(deliver(iframe, { ...envelope, type: "replace-styles" })).toEqual([]);
  });

  it("drops a message addressed to another card", () => {
    const iframe = mountFrame({ left: 0, top: 0, width: 800, height: 600 }, 800);
    registerCardFrameSource("card-1", iframe);

    expect(deliver(iframe, { ...envelope, cardId: "card-2", type: "frame-ready" })).toEqual([]);
  });
});
