// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createElement, type ReactElement } from "react";
import { CanvasCard } from "./CanvasCard.tsx";
import { PROTOCOL_VERSION } from "./frameProtocol.ts";
import { activateIframeWorkspace, getCanvasCards, hydrateCanvasStore, resizeCard, type CanvasCard as CanvasCardData, useCanvasCards } from "./canvasStore.ts";
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

  it("shows a card title in place of dimensions when one is available", () => {
    const card: CanvasCardData = {
      id: "card-title",
      url: window.location.href,
      title: "Version 1",
      x: 20,
      y: 30,
      width: 1024,
      height: 768,
    };
    hydrateCanvasStore("canvas", [card], { x: 0, y: 0, zoom: 1 });
    renderCard(card);

    expect(host.querySelector(`[data-test="canvas-card-dimensions-${card.id}"]`)?.textContent).toBe("Version 1");
  });

  it("loads an explicit restored fragment requested after the iframe mounts", () => {
    const previous = new URL("/playground#previous", window.location.href).href;
    const requested = new URL("/playground#requested", window.location.href).href;
    const card: CanvasCardData = {
      id: "card-restored-route",
      url: previous,
      title: null,
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    };
    hydrateCanvasStore("canvas", [card], { x: 0, y: 0, zoom: 1 });
    root = createRoot(host);
    act(() => {
      root!.render(createElement(StoreBackedCard));
    });

    const iframe = host.querySelector("iframe");
    expect(iframe?.getAttribute("src")).toBe(previous);

    act(() => {
      activateIframeWorkspace(requested, { width: 1200, height: 800 });
    });

    expect(iframe?.getAttribute("src")).toBe(requested);
  });

  it("returns the selected card to the focused preview", () => {
    const card: CanvasCardData = {
      id: "card-focus-preview",
      url: window.location.href,
      title: null,
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    };
    const onShowFocus = vi.fn();
    root = createRoot(host);
    act(() => {
      root!.render(createElement(CanvasCard, { card, onShowFocus }));
    });

    const control = host.querySelector(`[data-test="canvas-card-focus-${card.id}"]`);
    if (!(control instanceof HTMLButtonElement)) throw new Error("Focus control did not mount");
    act(() => control.click());

    expect(control.classList.contains("button--primary")).toBe(true);
    expect(control.textContent).toContain("Focus");
    expect(onShowFocus).toHaveBeenCalledWith(card.id);
  });

  it("returns a selected card to the focused preview", () => {
    const card: CanvasCardData = {
      id: "card-focus-preview",
      url: window.location.href,
      title: null,
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    };
    const onShowFocus = vi.fn();
    root = createRoot(host);
    act(() => {
      root!.render(createElement(CanvasCard, { card, onShowFocus }));
    });

    const control = host.querySelector(`[data-test="canvas-card-focus-${card.id}"]`);
    if (!(control instanceof HTMLButtonElement)) throw new Error("Focus control did not mount");
    act(() => control.click());

    expect(control.textContent).toContain("Focus");
    expect(onShowFocus).toHaveBeenCalledWith(card.id);
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
    root = createRoot(host);
    act(() => {
      root!.render(createElement(CanvasCard, { card, onShowFocus: vi.fn() }));
    });

    const dimensions = host.querySelector(
      `[data-test="canvas-card-dimensions-${card.id}"]`,
    );
    const focus = host.querySelector(`[data-test="canvas-card-focus-${card.id}"]`);
    if (!(dimensions instanceof HTMLElement) || !(focus instanceof HTMLElement)) {
      throw new Error("toolbar content did not mount");
    }

    expect(dimensions.style.transformOrigin).toBe("left bottom");
    expect(focus.style.transformOrigin).toBe("left bottom");
  });

  it("does not render card action buttons", () => {
    const card: CanvasCardData = {
      id: "card-actions-removed",
      url: window.location.href,
      title: null,
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    };
    renderCard(card);

    expect(host.querySelector(`[data-test="canvas-card-open-app-${card.id}"]`)).toBeNull();
    expect(host.querySelector(`[data-test="canvas-card-duplicate-${card.id}"]`)).toBeNull();
    expect(host.querySelector(`[data-test="canvas-card-reload-${card.id}"]`)).toBeNull();
  });

  it("renders the Open app action when the workspace supplies it", () => {
    const card: CanvasCardData = {
      id: "card-open-app",
      url: window.location.href,
      title: null,
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    };
    const onOpenApp = vi.fn();
    root = createRoot(host);
    act(() => {
      root!.render(createElement(CanvasCard, { card, onOpenApp }));
    });

    const control = host.querySelector(`[data-test="canvas-card-open-app-${card.id}"]`);
    if (!(control instanceof HTMLButtonElement)) throw new Error("Open app control did not mount");
    act(() => control.click());

    expect(control.textContent).toContain("Open app");
    expect(onOpenApp).toHaveBeenCalledWith(card);
  });
});
