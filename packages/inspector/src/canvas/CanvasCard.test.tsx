// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createElement } from "react";
import { CanvasCard } from "./CanvasCard.tsx";
import { PROTOCOL_VERSION } from "./frameProtocol.ts";
import { configureNudgeUiRuntime } from "../runtimeConfig.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface PostedMessage {
  type: string;
  protocolVersion: number;
  cardId?: string;
}

describe("CanvasCard renderer handshake", () => {
  let host: HTMLDivElement;
  let root: Root | null = null;
  let posted: PostedMessage[];
  let contentWindow: { postMessage: (msg: unknown, origin: string) => void };

  beforeEach(() => {
    configureNudgeUiRuntime({
      projectId: "test-project",
      host: "vite-react",
      framework: "React",
      stylingSystem: "CSS custom properties",
      capabilities: { canvas: true, componentSemantics: true },
      tokenCatalog: [],
      tokens: [],
      tokenDiagnostics: [],
      tokenGeneration: "",
      componentContracts: [],
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    posted = [];
    contentWindow = {
      postMessage: (msg) => {
        posted.push(msg as PostedMessage);
      },
    };
  });

  afterEach(() => {
    if (root) {
      act(() => {
        root!.unmount();
      });
      root = null;
    }
    host.remove();
  });

  function mountCard(): HTMLElement {
    const iframe = document.createElement("iframe");
    Object.defineProperty(iframe, "contentWindow", { value: contentWindow });
    const originalCreateElement = document.createElement.bind(document);
    const card = {
      id: "card-7",
      url: window.location.href,
      title: null,
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    };
    root = createRoot(host);
    // The component reads its iframe through the ref, so render with a stubbed
    // createElement that hands back the prepared frame when asked for one.
    const rendered = createElement(CanvasCard, { card });
    act(() => {
      root!.render(rendered);
    });
    const actual = host.querySelector("iframe");
    if (!actual) throw new Error("card did not mount an iframe");
    // Swap in the stubbed contentWindow before any message traffic.
    Object.defineProperty(actual, "contentWindow", { value: contentWindow });
    void originalCreateElement;
    void iframe;
    return actual;
  }

  function messageFromFrame(data: unknown): MessageEvent {
    return new MessageEvent("message", {
      origin: window.location.origin,
      source: contentWindow as unknown as MessageEventSource,
      data,
    });
  }

  it("answers a renderer-hello solicitation with parent-ready identity", () => {
    const iframe = mountCard();

    act(() => {
      window.dispatchEvent(messageFromFrame({
        type: "renderer-hello",
        protocolVersion: PROTOCOL_VERSION,
      }));
    });

    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({
      type: "parent-ready",
      protocolVersion: PROTOCOL_VERSION,
      cardId: "card-7",
    });
    void iframe;
  });

  it("ignores hello solicitations from other protocol versions", () => {
    mountCard();

    act(() => {
      window.dispatchEvent(messageFromFrame({
        type: "renderer-hello",
        protocolVersion: PROTOCOL_VERSION - 1,
      }));
    });

    expect(posted).toHaveLength(0);
  });

  it("ignores messages whose source is not this card's frame", () => {
    mountCard();

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        origin: window.location.origin,
        source: null,
        data: { type: "renderer-hello", protocolVersion: PROTOCOL_VERSION },
      }));
    });

    expect(posted).toHaveLength(0);
  });
});
