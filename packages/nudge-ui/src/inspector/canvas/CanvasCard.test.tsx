// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createElement, type ReactElement } from "react";
import { CanvasCard } from "./CanvasCard.tsx";
import { PROTOCOL_VERSION } from "./frameProtocol.ts";
import { getCanvasCards, hydrateCanvasStore, resizeCard, type CanvasCard as CanvasCardData, useCanvasCards } from "./canvasStore.ts";
import { configureNudgeUiRuntime } from "../runtime/runtimeConfig.ts";

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
    hydrateCanvasStore("inspect", [], { x: 0, y: 0, zoom: 1 });
    host.remove();
  });

  function renderCard(card: CanvasCardData): void {
    root = createRoot(host);
    act(() => {
      root!.render(createElement(CanvasCard, { card }));
    });
  }

  function StoreBackedCard(): ReactElement | null {
    const card = useCanvasCards()[0];
    return card ? createElement(CanvasCard, { card }) : null;
  }

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

  it("shows live card dimensions in the toolbar", () => {
    const card: CanvasCardData = {
      id: "card-dimensions",
      url: window.location.href,
      title: null,
      x: 20,
      y: 30,
      width: 1440.4,
      height: 899.6,
    };
    hydrateCanvasStore("canvas", [card], { x: 0, y: 0, zoom: 1 });
    root = createRoot(host);
    act(() => {
      root!.render(createElement(StoreBackedCard));
    });

    const dimensions = () => host.querySelector(
      `[data-test="canvas-card-dimensions-${card.id}"]`,
    )?.textContent;

    expect(dimensions()).toBe("1440 × 900 px");

    act(() => resizeCard(card.id, 1024, 768));

    expect(dimensions()).toBe("1024 × 768 px");
  });

  it("moves the card when dragging from the dimension surface", () => {
    const card: CanvasCardData = {
      id: "card-drag-surface",
      url: window.location.href,
      title: null,
      x: 40,
      y: 60,
      width: 800,
      height: 600,
    };
    hydrateCanvasStore("canvas", [card], { x: 0, y: 0, zoom: 1 });
    renderCard(card);

    const dragSurface = host.querySelector(
      `[data-test="canvas-card-drag-${card.id}"]`,
    );
    if (!(dragSurface instanceof HTMLElement)) throw new Error("drag surface did not mount");
    Object.defineProperty(dragSurface, "setPointerCapture", { value: () => {} });

    const pointerEvent = (type: string, clientX: number, clientY: number): Event => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.defineProperties(event, {
        clientX: { value: clientX },
        clientY: { value: clientY },
        pointerId: { value: 1 },
      });
      return event;
    };

    act(() => {
      dragSurface.dispatchEvent(pointerEvent("pointerdown", 100, 200));
      window.dispatchEvent(pointerEvent("pointermove", 160, 260));
    });

    expect(getCanvasCards()[0]).toMatchObject({ x: 100, y: 120 });

    act(() => {
      window.dispatchEvent(pointerEvent("pointerup", 160, 260));
    });
  });

  it("keeps the resize handle screen-sized while the board is zoomed", () => {
    const card: CanvasCardData = {
      id: "card-resize-scale",
      url: window.location.href,
      title: null,
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    };
    hydrateCanvasStore("canvas", [card], { x: 0, y: 0, zoom: 0.5 });
    renderCard(card);

    const resizeHandle = host.querySelector(
      `[data-test="canvas-card-resize-${card.id}"]`,
    );
    if (!(resizeHandle instanceof HTMLElement)) throw new Error("resize handle did not mount");

    expect(resizeHandle.style.transform).toBe("scale(2)");
    expect(resizeHandle.style.transformOrigin).toBe("right bottom");
  });

  it("anchors scaled toolbar content to the canvas top edge", () => {
    const card: CanvasCardData = {
      id: "card-toolbar-anchor",
      url: window.location.href,
      title: null,
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    };
    hydrateCanvasStore("canvas", [card], { x: 0, y: 0, zoom: 0.5 });
    renderCard(card);

    const dimensions = host.querySelector(
      `[data-test="canvas-card-dimensions-${card.id}"]`,
    );
    const actions = host.querySelector(".canvas-card__actions");
    if (!(dimensions instanceof HTMLElement) || !(actions instanceof HTMLElement)) {
      throw new Error("toolbar content did not mount");
    }

    expect(dimensions.style.transformOrigin).toBe("left bottom");
    expect(actions.style.transformOrigin).toBe("right bottom");
  });
});
