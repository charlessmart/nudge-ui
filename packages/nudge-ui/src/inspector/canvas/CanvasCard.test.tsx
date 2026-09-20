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

  function pointerEvent(type: string, clientX: number, clientY: number, pointerId = 1): Event {
    const event = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      clientX: { value: clientX },
      clientY: { value: clientY },
      pointerId: { value: pointerId },
    });
    return event;
  }

  function keyEvent(key: string, shiftKey = false): KeyboardEvent {
    return new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      key,
      shiftKey,
    });
  }

  function mockPointerCapture(element: HTMLElement): {
    setPointerCapture: ReturnType<typeof vi.fn>;
    releasePointerCapture: ReturnType<typeof vi.fn>;
  } {
    const captured = new Set<number>();
    const setPointerCapture = vi.fn((pointerId: number) => captured.add(pointerId));
    const releasePointerCapture = vi.fn((pointerId: number) => captured.delete(pointerId));
    Object.defineProperties(element, {
      setPointerCapture: { value: setPointerCapture },
      hasPointerCapture: { value: (pointerId: number) => captured.has(pointerId) },
      releasePointerCapture: { value: releasePointerCapture },
    });
    return { setPointerCapture, releasePointerCapture };
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

    act(() => {
      dragSurface.dispatchEvent(pointerEvent("pointerdown", 100, 200));
      window.dispatchEvent(pointerEvent("pointermove", 160, 260));
    });

    expect(getCanvasCards()[0]).toMatchObject({ x: 100, y: 120 });

    act(() => {
      window.dispatchEvent(pointerEvent("pointerup", 160, 260));
    });
  });

  it("renders every edge and corner handle with its directional cursor", () => {
    const card: CanvasCardData = {
      id: "card-all-resize-handles",
      url: window.location.href,
      title: null,
      x: 100,
      y: 80,
      width: 800,
      height: 600,
    };
    renderCard(card);

    const handles = [
      { direction: "top-left", cursor: "nwse-resize", label: "Resize card from the top-left corner" },
      { direction: "top", cursor: "ns-resize", label: "Resize card from the top edge" },
      { direction: "top-right", cursor: "nesw-resize", label: "Resize card from the top-right corner" },
      { direction: "right", cursor: "ew-resize", label: "Resize card from the right edge" },
      { direction: "bottom-right", cursor: "nwse-resize", label: "Resize card" },
      { direction: "bottom", cursor: "ns-resize", label: "Resize card from the bottom edge" },
      { direction: "bottom-left", cursor: "nesw-resize", label: "Resize card from the bottom-left corner" },
      { direction: "left", cursor: "ew-resize", label: "Resize card from the left edge" },
    ];

    expect(host.querySelectorAll('[data-resize-direction]')).toHaveLength(handles.length);
    for (const handleDefinition of handles) {
      const handle = host.querySelector(
        `[data-resize-direction="${handleDefinition.direction}"]`,
      );
      if (!(handle instanceof HTMLElement)) {
        throw new Error(`${handleDefinition.direction} resize handle did not mount`);
      }
      expect(handle.style.cursor).toBe(handleDefinition.cursor);
      expect(handle.getAttribute("aria-label")).toBe(handleDefinition.label);
    }
  });

  it("resizes from every handle with direction-aware keyboard steps", () => {
    const card: CanvasCardData = {
      id: "card-keyboard-resize",
      url: window.location.href,
      title: null,
      x: 100,
      y: 80,
      width: 800,
      height: 600,
    };
    const cases = [
      { direction: "top-left", key: "ArrowLeft", expected: { x: 80, width: 820, y: 80, height: 600 } },
      { direction: "top", key: "ArrowUp", expected: { x: 100, width: 800, y: 60, height: 620 } },
      { direction: "top-right", key: "ArrowRight", expected: { x: 100, width: 820, y: 80, height: 600 } },
      { direction: "right", key: "ArrowRight", expected: { x: 100, width: 820, y: 80, height: 600 } },
      { direction: "bottom-right", key: "ArrowDown", shiftKey: true, expected: { x: 100, width: 800, y: 80, height: 640 } },
      { direction: "bottom", key: "ArrowDown", expected: { x: 100, width: 800, y: 80, height: 620 } },
      { direction: "bottom-left", key: "ArrowLeft", expected: { x: 80, width: 820, y: 80, height: 600 } },
      { direction: "left", key: "ArrowLeft", expected: { x: 80, width: 820, y: 80, height: 600 } },
    ];
    hydrateCanvasStore("canvas", [card], { x: 0, y: 0, zoom: 1 });
    root = createRoot(host);
    act(() => {
      root!.render(createElement(StoreBackedCard));
    });

    const globalKeydown = vi.fn();
    window.addEventListener("keydown", globalKeydown);
    try {
      for (const resizeCase of cases) {
        act(() => {
          hydrateCanvasStore("canvas", [card], { x: 0, y: 0, zoom: 1 });
        });
        const resizeHandle = host.querySelector(
          `[data-resize-direction="${resizeCase.direction}"]`,
        );
        if (!(resizeHandle instanceof HTMLElement)) {
          throw new Error(`${resizeCase.direction} resize handle did not mount`);
        }

        act(() => {
          resizeHandle.dispatchEvent(keyEvent(resizeCase.key, resizeCase.shiftKey));
        });

        expect(getCanvasCards()[0]).toMatchObject(resizeCase.expected);
      }
    } finally {
      window.removeEventListener("keydown", globalKeydown);
    }
    expect(globalKeydown).not.toHaveBeenCalled();
  });

  it("resizes horizontally from the left edge and releases pointer capture", () => {
    const card: CanvasCardData = {
      id: "card-left-resize",
      url: window.location.href,
      title: null,
      x: 100,
      y: 80,
      width: 800,
      height: 600,
    };
    hydrateCanvasStore("canvas", [card], { x: 0, y: 0, zoom: 1 });
    renderCard(card);

    const resizeHandle = host.querySelector(
      `[data-test="canvas-card-resize-${card.id}-left"]`,
    );
    if (!(resizeHandle instanceof HTMLElement)) throw new Error("left resize handle did not mount");
    const capture = mockPointerCapture(resizeHandle);

    expect(resizeHandle.style.cursor).toBe("ew-resize");
    act(() => {
      resizeHandle.dispatchEvent(pointerEvent("pointerdown", 100, 200));
      window.dispatchEvent(pointerEvent("pointermove", 60, 200));
    });

    expect(getCanvasCards()[0]).toMatchObject({ x: 60, y: 80, width: 840, height: 600 });
    expect(capture.setPointerCapture).toHaveBeenCalledWith(1);

    act(() => {
      window.dispatchEvent(pointerEvent("pointerup", 60, 200));
    });

    expect(capture.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it("resizes vertically from the top edge while preserving the bottom edge", () => {
    const card: CanvasCardData = {
      id: "card-top-resize",
      url: window.location.href,
      title: null,
      x: 100,
      y: 80,
      width: 800,
      height: 600,
    };
    hydrateCanvasStore("canvas", [card], { x: 0, y: 0, zoom: 1 });
    renderCard(card);

    const resizeHandle = host.querySelector(
      `[data-test="canvas-card-resize-${card.id}-top"]`,
    );
    if (!(resizeHandle instanceof HTMLElement)) throw new Error("top resize handle did not mount");
    mockPointerCapture(resizeHandle);

    expect(resizeHandle.style.cursor).toBe("ns-resize");
    act(() => {
      resizeHandle.dispatchEvent(pointerEvent("pointerdown", 400, 80));
      window.dispatchEvent(pointerEvent("pointermove", 400, 50));
      window.dispatchEvent(pointerEvent("pointerup", 400, 50));
    });

    expect(getCanvasCards()[0]).toMatchObject({ x: 100, y: 50, width: 800, height: 630 });
  });

  it("resizes both dimensions from a corner handle", () => {
    const card: CanvasCardData = {
      id: "card-corner-resize",
      url: window.location.href,
      title: null,
      x: 100,
      y: 80,
      width: 800,
      height: 600,
    };
    hydrateCanvasStore("canvas", [card], { x: 0, y: 0, zoom: 1 });
    renderCard(card);

    const resizeHandle = host.querySelector(
      `[data-test="canvas-card-resize-${card.id}-top-left"]`,
    );
    if (!(resizeHandle instanceof HTMLElement)) throw new Error("top-left resize handle did not mount");
    mockPointerCapture(resizeHandle);

    expect(resizeHandle.style.cursor).toBe("nwse-resize");
    act(() => {
      resizeHandle.dispatchEvent(pointerEvent("pointerdown", 100, 80));
      window.dispatchEvent(pointerEvent("pointermove", 60, 50));
      window.dispatchEvent(pointerEvent("pointerup", 60, 50));
    });

    expect(getCanvasCards()[0]).toMatchObject({ x: 60, y: 50, width: 840, height: 630 });
  });

  it("stops a resize on pointer cancel and keeps the minimum dimensions", () => {
    const card: CanvasCardData = {
      id: "card-cancel-resize",
      url: window.location.href,
      title: null,
      x: 100,
      y: 80,
      width: 800,
      height: 600,
    };
    hydrateCanvasStore("canvas", [card], { x: 0, y: 0, zoom: 1 });
    renderCard(card);

    const resizeHandle = host.querySelector(
      `[data-test="canvas-card-resize-${card.id}-left"]`,
    );
    if (!(resizeHandle instanceof HTMLElement)) throw new Error("left resize handle did not mount");
    const capture = mockPointerCapture(resizeHandle);

    act(() => {
      resizeHandle.dispatchEvent(pointerEvent("pointerdown", 100, 200));
      window.dispatchEvent(pointerEvent("pointermove", 1_000, 200));
      window.dispatchEvent(pointerEvent("pointercancel", 1_000, 200));
      window.dispatchEvent(pointerEvent("pointermove", 900, 200));
    });

    expect(getCanvasCards()[0]).toMatchObject({ x: 700, width: 200 });
    expect(capture.releasePointerCapture).toHaveBeenCalledWith(1);
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

  it("inverse-scales only the thickness of zoomed edge handles", () => {
    const card = {
      id: "card-edge-resize-scale",
      url: "http://localhost:3000/edge-scale",
      title: "Edge scale",
      x: 0,
      y: 0,
      width: 800,
      height: 600,
    };
    hydrateCanvasStore("canvas", [card], { x: 0, y: 0, zoom: 0.5 });
    renderCard(card);

    const top = host.querySelector<HTMLElement>(`[data-test="canvas-card-resize-${card.id}-top"]`);
    const left = host.querySelector<HTMLElement>(`[data-test="canvas-card-resize-${card.id}-left"]`);
    if (!top || !left) throw new Error("edge resize handles did not mount");

    expect(top.style.transform).toBe("scale(1, 2)");
    expect(left.style.transform).toBe("scale(2, 1)");
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

    expect(dimensions.style.transformOrigin).toBe("center bottom");
    expect(dimensions.style.transform).toBe("translateX(-50%) scale(2)");
    expect(focus.style.transformOrigin).toBe("left bottom");
    expect(focus.style.transform).toBe("scale(2)");
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

});
