// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { getSelectedElement, setSelectedElement } from "../selection/selectionStore.ts";
import { resolveSelectionFromElement } from "../selection/resolveSelection.ts";
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
});
