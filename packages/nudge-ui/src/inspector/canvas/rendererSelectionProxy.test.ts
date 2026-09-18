// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { getSelectedElement, getSelectedElements, setSelectedElement } from "../selection/selectionStore.ts";
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

  it("selects a renderer-owned element whose optional source metadata is absent", () => {
    const iframe = createFrame();
    const frameDocument = iframe.contentDocument!;
    const button = frameDocument.createElement("button");
    button.setAttribute("data-cid", "Button");
    button.setAttribute("data-renderer-id", "r1");
    frameDocument.body.appendChild(button);

    handleElementClick(clickMessage({ src: "" }), iframe, "card-1");

    expect(getSelectedElement()?.domElement).toBe(button);
    expect(getSelectedElement()?.src).toBe("");
  });

  it("keeps component prop controls available for an iframe selection", () => {
    const iframe = createFrame();
    const frameDocument = iframe.contentDocument!;
    const button = frameDocument.createElement("button");
    button.setAttribute("data-cid", "Button");
    button.setAttribute("data-src", "/src/Button.tsx:32:5");
    button.setAttribute("data-renderer-id", "r1");
    frameDocument.body.appendChild(button);
    const FrameMap = Reflect.get(iframe.contentWindow!, "Map") as MapConstructor;
    Reflect.set(iframe.contentWindow!, Symbol.for("nudge-ui.host-runtime.v1"), {
      version: 1,
      adapters: new FrameMap([["react", {
        framework: "react",
        inspect: () => [{
          framework: "react",
          meta: {
            callsiteId: "callsite-1",
            componentId: "/src/Button#Button",
            componentName: "Button",
            file: "/src/Button.tsx",
            line: 32,
            column: 5,
            authoredProps: { disabled: "literal" },
          },
          props: { disabled: false },
        }],
        replaceOverrides: () => undefined,
      }]]),
      overrides: new FrameMap(),
    });

    handleElementClick(clickMessage(), iframe, "card-1");

    expect(getSelectedElement()?.componentTargets).toMatchObject([{
      framework: "react",
      meta: { componentName: "Button" },
      props: { disabled: false },
    }]);
  });

  it("does not counterfeit a selection with the iframe body when identity is stale", () => {
    const iframe = createFrame();

    handleElementClick(clickMessage(), iframe, "card-1");

    expect(getSelectedElement()).toBeNull();
  });

  it("fails closed when the renderer identity is missing", () => {
    const iframe = createFrame();
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

  it("adds a same-frame renderer target on an additive click", () => {
    const iframe = createFrame();
    const frameDocument = iframe.contentDocument!;
    const buttons = ["r1", "r2"].map((elementId) => {
      const button = frameDocument.createElement("button");
      button.setAttribute("data-cid", "Button");
      button.setAttribute("data-src", "/src/Button.tsx:32:5");
      button.setAttribute("data-renderer-id", elementId);
      frameDocument.body.appendChild(button);
      return button;
    });

    handleElementClick(clickMessage({ elementId: "r1" }), iframe, "card-1");
    handleElementClick(clickMessage({ elementId: "r2", additive: true }), iframe, "card-1");

    expect(getSelectedElements().map((selected) => selected.domElement)).toEqual(buttons);
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
