// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getSelectedElement, setSelectedElement } from "../selection/selectionStore.ts";
import { resolveSelectionFromElement } from "../selection/resolveSelection.ts";
import { clearWorkspace, getChangesList } from "../changes/changesLog.ts";
import {
  cancelInlineTextEdit,
  getInlineTextDiagnostic,
  getInlineTextSession,
} from "../inline-text/inlineTextEditor.ts";
import { CanvasElementOverlay } from "./CanvasElementOverlay.tsx";
import {
  PROTOCOL_VERSION,
  type FrameIdentity,
} from "./frameProtocol.ts";
import {
  PROJECT_ID,
  WORKSPACE_ID,
  registerCardFrame,
  unregisterCardFrame,
} from "./projection.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("CanvasElementOverlay", () => {
  let host: HTMLDivElement;
  let iframe: HTMLIFrameElement;
  let root: Root | null = null;
  const cardId = "card-1";

  beforeEach(() => {
    host = document.createElement("div");
    iframe = document.createElement("iframe");
    iframe.setAttribute("data-nudge-ui-canvas-renderer", "true");
    document.body.append(host, iframe);
    registerCardFrame(cardId, iframe);

    root = createRoot(host);
    act(() => {
      root!.render(createElement(CanvasElementOverlay));
    });
  });

  afterEach(() => {
    act(() => {
      root?.unmount();
    });
    root = null;
    cancelInlineTextEdit();
    clearWorkspace();
    setSelectedElement(null);
    unregisterCardFrame(cardId);
    host.remove();
    iframe.remove();
  });

  it("clears controller selection when its renderer sends Escape", () => {
    const frameDocument = iframe.contentDocument!;
    const button = frameDocument.createElement("button");
    button.setAttribute("data-cid", "Button");
    button.setAttribute("data-src", "/src/Button.tsx:32:5");
    button.setAttribute("data-renderer-id", "r1");
    frameDocument.body.append(button);

    act(() => {
      setSelectedElement(resolveSelectionFromElement(button));
    });
    expect(getSelectedElement()?.domElement).toBe(button);

    const message: FrameIdentity & {
      type: "element-deselect";
      protocolVersion: number;
    } = {
      type: "element-deselect",
      protocolVersion: PROTOCOL_VERSION,
      projectId: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      cardId,
    };

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        origin: window.location.origin,
        source: iframe.contentWindow as MessageEventSource,
        data: message,
      }));
    });

    expect(getSelectedElement()).toBeNull();
  });

  it("forwards parent Alt state to registered renderer frames", () => {
    const postMessage = vi.spyOn(iframe.contentWindow!, "postMessage").mockImplementation(() => undefined);

    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Alt", altKey: true }));
    });

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "measure-modifier",
      cardId,
      altKey: true,
    }), window.location.origin);
    postMessage.mockRestore();
  });

  it("projects the hovered padding guide into the board viewport", () => {
    const frameDocument = iframe.contentDocument!;
    const card = frameDocument.createElement("section");
    card.setAttribute("data-cid", "Card");
    card.setAttribute("data-src", "/src/Card.tsx:12:3");
    card.setAttribute("data-renderer-id", "r1");
    card.style.paddingTop = "20px";
    frameDocument.body.append(card);
    Object.defineProperty(iframe, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 100, top: 40, width: 300, height: 200, right: 400, bottom: 240 } as DOMRect),
    });
    Object.defineProperty(card, "getBoundingClientRect", {
      configurable: true,
      value: () => ({ left: 10, top: 10, width: 200, height: 120, right: 210, bottom: 130 } as DOMRect),
    });
    Object.defineProperty(frameDocument, "elementFromPoint", {
      configurable: true,
      value: () => card,
    });

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        origin: window.location.origin,
        source: iframe.contentWindow as MessageEventSource,
        data: {
          type: "element-hover",
          protocolVersion: PROTOCOL_VERSION,
          projectId: PROJECT_ID,
          workspaceId: WORKSPACE_ID,
          cardId,
          cid: "Card",
          selector: '[data-cid="Card"]',
          src: "/src/Card.tsx:12:3",
          elementId: "r1",
          rect: { left: 10, top: 10, width: 200, height: 120 },
          margins: { top: 0, right: 0, bottom: 0, left: 0 },
          borders: { top: 0, right: 0, bottom: 0, left: 0 },
          point: { x: 100, y: 20 },
          spacing: { kind: "padding", property: "padding-top", side: "top" },
        },
      }));
    });

    const guide = host.querySelector<HTMLElement>('[data-test="canvas-spacing-guide"]');
    expect(guide).not.toBeNull();
    expect(guide?.dataset.property).toBe("padding-top");
    expect(guide?.style.left).toBe("110px");
    expect(guide?.style.top).toBe("59px");
  });

  it("records the same actionable rejection for an unsupported Canvas edit", () => {
    const frameDocument = iframe.contentDocument!;
    const target = frameDocument.createElement("div");
    target.setAttribute("data-cid", "EmptyCopy");
    target.setAttribute("data-src", "/src/Page.tsx:18:5");
    target.setAttribute("data-renderer-id", "r2");
    frameDocument.body.append(target);

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        origin: window.location.origin,
        source: iframe.contentWindow as MessageEventSource,
        data: {
          type: "inline-text-intent",
          protocolVersion: PROTOCOL_VERSION,
          intent: "double-click",
          cid: "EmptyCopy",
          src: "/src/Page.tsx:18:5",
          elementId: "r2",
          point: { x: 12, y: 18 },
          projectId: PROJECT_ID,
          workspaceId: WORKSPACE_ID,
          cardId,
        },
      }));
    });

    expect(getInlineTextSession()).toBeNull();
    expect(getInlineTextDiagnostic()).toMatchObject({ status: "rejected", reason: "no-text" });
  });

  it("opens and commits an editable Canvas text target through the shared editor", () => {
    const frameDocument = iframe.contentDocument!;
    const target = frameDocument.createElement("p");
    target.setAttribute("data-cid", "CanvasCopy");
    target.setAttribute("data-src", "/src/Page.tsx:22:5");
    target.setAttribute("data-renderer-id", "r3");
    target.textContent = "Canvas copy";
    frameDocument.body.append(target);

    act(() => {
      window.dispatchEvent(new MessageEvent("message", {
        origin: window.location.origin,
        source: iframe.contentWindow as MessageEventSource,
        data: {
          type: "inline-text-intent",
          protocolVersion: PROTOCOL_VERSION,
          intent: "double-click",
          cid: "CanvasCopy",
          src: "/src/Page.tsx:22:5",
          elementId: "r3",
          point: { x: 12, y: 18 },
          projectId: PROJECT_ID,
          workspaceId: WORKSPACE_ID,
          cardId,
        },
      }));
    });

    const session = getInlineTextSession();
    expect(session).not.toBeNull();
    session!.host.textContent = "Updated Canvas copy";
    act(() => {
      session!.commit();
    });

    expect(getInlineTextSession()).toBeNull();
    expect(getChangesList()).toHaveLength(1);
    expect(getInlineTextDiagnostic()).toMatchObject({ status: "committed", reason: "commit" });
  });
});
