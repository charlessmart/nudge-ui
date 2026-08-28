// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { getSelectedElement, setSelectedElement } from "../selectionStore.ts";
import { PROTOCOL_VERSION, type ElementClickMessage } from "./frameProtocol.ts";
import { handleElementClick } from "./rendererSelectionProxy.ts";

function createFrame(): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  return iframe;
}

function clickMessage(overrides: Partial<ElementClickMessage> = {}): ElementClickMessage {
  return {
    type: "element-click",
    protocolVersion: PROTOCOL_VERSION,
    cid: "Button",
    selector: '[data-cid="Button"]',
    src: "/src/Button.tsx:32:5",
    elementId: "r1",
    file: "/src/Button.tsx",
    line: 32,
    component: "Button",
    projectId: "test-project",
    workspaceId: "test-workspace",
    cardId: "card-1",
    ...overrides,
  };
}

afterEach(() => {
  setSelectedElement(null);
  document.body.innerHTML = "";
});

describe("handleElementClick", () => {
  it("selects the exact HTMLElement from the iframe realm", () => {
    const iframe = createFrame();
    const frameDocument = iframe.contentDocument!;
    const button = frameDocument.createElement("button");
    button.setAttribute("data-cid", "Button");
    button.setAttribute("data-src", "/src/Button.tsx:32:5");
    button.setAttribute("data-renderer-id", "r1");
    frameDocument.body.appendChild(button);

    expect(button instanceof window.HTMLElement).toBe(false);

    handleElementClick(clickMessage(), iframe, "card-1");

    expect(getSelectedElement()?.domElement).toBe(button);
    expect(getSelectedElement()?.domElement.ownerDocument).toBe(frameDocument);
  });

  it("does not counterfeit a selection with the iframe body when identity is stale", () => {
    const iframe = createFrame();

    handleElementClick(clickMessage(), iframe, "card-1");

    expect(getSelectedElement()).toBeNull();
  });

  it("fails closed when the renderer identity is missing", () => {
    const iframe = createFrame();
    const frameDocument = iframe.contentDocument!;
    handleElementClick(clickMessage({ elementId: "r404" }), iframe, "card-1");

    expect(getSelectedElement()).toBeNull();
  });

  it("resolves the exact renderer-owned node after a reorder", () => {
    const iframe = createFrame();
    const frameDocument = iframe.contentDocument!;
    const buttons: HTMLButtonElement[] = [];
    for (let index = 0; index < 2; index += 1) {
      const button = frameDocument.createElement("button");
      button.setAttribute("data-cid", "Button");
      button.setAttribute("data-src", "/src/Button.tsx:32:5");
      button.setAttribute("data-renderer-id", `r${index + 1}`);
      frameDocument.body.appendChild(button);
      buttons.push(button);
    }

    frameDocument.body.prepend(buttons[1]!);
    handleElementClick(clickMessage({ elementId: "r2" }), iframe, "card-1");

    expect(getSelectedElement()?.domElement).toBe(buttons[1]);
  });

  it("fails closed when the renderer-owned node no longer exists", () => {
    const iframe = createFrame();
    const frameDocument = iframe.contentDocument!;
    const button = frameDocument.createElement("button");
    button.setAttribute("data-cid", "Button");
    button.setAttribute("data-src", "/src/Button.tsx:32:5");
    button.setAttribute("data-renderer-id", "r1");
    frameDocument.body.appendChild(button);

    handleElementClick(clickMessage({ elementId: "r2" }), iframe, "card-1");

    expect(getSelectedElement()).toBeNull();
  });

  it("fails closed when the renderer ID is duplicated or its source metadata drifts", () => {
    const iframe = createFrame();
    const frameDocument = iframe.contentDocument!;
    for (const src of ["/src/Button.tsx:32:5", "/src/Other.tsx:8:2"]) {
      const button = frameDocument.createElement("button");
      button.setAttribute("data-cid", "Button");
      button.setAttribute("data-src", src);
      button.setAttribute("data-renderer-id", "r1");
      frameDocument.body.appendChild(button);
    }

    handleElementClick(clickMessage(), iframe, "card-1");
    expect(getSelectedElement()).toBeNull();

    frameDocument.body.lastElementChild?.remove();
    handleElementClick(clickMessage(), iframe, "card-1");
    expect(getSelectedElement()?.domElement).toBe(frameDocument.body.firstElementChild);
  });
});
