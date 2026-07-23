// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { getSelectedElement, setSelectedElement } from "../selectionStore.ts";
import type { ElementClickMessage } from "./frameProtocol.ts";
import { handleElementClick } from "./rendererSelectionProxy.ts";

function createFrame(): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  document.body.appendChild(iframe);
  return iframe;
}

function clickMessage(overrides: Partial<ElementClickMessage> = {}): ElementClickMessage {
  return {
    type: "element-click",
    protocolVersion: 1,
    cid: "Button",
    selector: '[data-cid="Button"]',
    src: "/src/Button.tsx:32:5",
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

  it("uses cid-only identity only when it is unambiguous", () => {
    const iframe = createFrame();
    const frameDocument = iframe.contentDocument!;
    for (let index = 0; index < 2; index++) {
      const button = frameDocument.createElement("button");
      button.setAttribute("data-cid", "Button");
      frameDocument.body.appendChild(button);
    }

    handleElementClick(clickMessage({ src: "" }), iframe, "card-1");

    expect(getSelectedElement()).toBeNull();
  });
});
