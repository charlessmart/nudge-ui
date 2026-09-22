// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PROTOCOL_VERSION, setRendererIdentity, type ElementHoverMessage } from "./frameProtocol.ts";
import { buildSelector, installRendererElementSelector } from "./rendererElementSelector.ts";
import { setNudgeUiHostDevFlag } from "../runtime/devFlag.ts";

const identity = {
  projectId: "project-a",
  workspaceId: "workspace-a",
  cardId: "card-a",
};

const scheduled: FrameRequestCallback[] = [];
const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalCancelAnimationFrame = window.cancelAnimationFrame;
const originalElementFromPoint = document.elementFromPoint;
let disposeRendererElementSelector: () => void = () => undefined;

function runScheduledFrame(): void {
  const callback = scheduled.shift();
  expect(callback).toBeDefined();
  callback?.(0);
}

function trackedElement(cid: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.dataset.cid = cid;
  element.dataset.src = `src/${cid}.tsx:1:1`;
  document.body.append(element);
  return element;
}

function dispatchMouseOver(element: HTMLElement): void {
  element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
}

function dispatchMouseOut(element: HTMLElement, relatedTarget: EventTarget): void {
  element.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget }));
}

function hoverMessages(postMessage: ReturnType<typeof vi.spyOn>): ElementHoverMessage[] {
  return postMessage.mock.calls
    .map(([message]) => message)
    .filter((message): message is ElementHoverMessage => (
      typeof message === "object"
      && message !== null
      && "type" in message
      && message.type === "element-hover"
    ));
}

beforeAll(() => {
  setNudgeUiHostDevFlag(true);
  setRendererIdentity(identity);
  window.requestAnimationFrame = ((callback: FrameRequestCallback) => {
    scheduled.push(callback);
    return scheduled.length;
  }) as typeof window.requestAnimationFrame;
  window.cancelAnimationFrame = (() => undefined) as typeof window.cancelAnimationFrame;
});

beforeEach(() => {
  setRendererIdentity(identity);
  scheduled.length = 0;
  disposeRendererElementSelector = installRendererElementSelector();
});

afterEach(() => {
  disposeRendererElementSelector();
  while (scheduled.length > 0) runScheduledFrame();
  vi.restoreAllMocks();
  if (originalElementFromPoint) {
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint,
    });
  } else {
    delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
  }
  document.body.innerHTML = "";
});

afterAll(() => {
  window.requestAnimationFrame = originalRequestAnimationFrame;
  window.cancelAnimationFrame = originalCancelAnimationFrame;
  setNudgeUiHostDevFlag(undefined);
});

describe("buildSelector", () => {
  it("escapes data-cid values before embedding them in an attribute selector", () => {
    const button = document.createElement("button");
    button.setAttribute("data-cid", 'Button"] ~ *[data-cid="Secret');
    document.body.appendChild(button);

    const selector = buildSelector(button);

    expect(() => document.querySelector(selector)).not.toThrow();
    expect(document.querySelector(selector)).toBe(button);
    expect(document.querySelectorAll(selector)).toHaveLength(1);
  });
});

describe("renderer hover scheduling", () => {
  it("coalesces many targets into one geometry read and sends the latest target", () => {
    const first = trackedElement("first");
    const second = trackedElement("second");
    second.style.borderStyle = "solid";
    second.style.borderWidth = "1px 2px 3px 4px";
    const firstRect = vi.spyOn(first, "getBoundingClientRect").mockReturnValue({
      left: 1, top: 2, width: 3, height: 4,
    } as DOMRect);
    const secondRect = vi.spyOn(second, "getBoundingClientRect").mockReturnValue({
      left: 5, top: 6, width: 7, height: 8,
    } as DOMRect);
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);

    dispatchMouseOver(first);
    dispatchMouseOver(second);
    dispatchMouseOver(first);
    dispatchMouseOver(second);

    expect(scheduled).toHaveLength(1);
    expect(firstRect).not.toHaveBeenCalled();
    expect(secondRect).not.toHaveBeenCalled();

    runScheduledFrame();

    expect(firstRect).not.toHaveBeenCalled();
    expect(secondRect).toHaveBeenCalledTimes(1);
    expect(hoverMessages(postMessage)).toHaveLength(1);
    expect(hoverMessages(postMessage)[0]).toMatchObject({
      cid: "second",
      rect: { left: 5, top: 6, width: 7, height: 8 },
      borders: { top: 1, right: 2, bottom: 3, left: 4 },
    });
  });

  it("lets a latest clear replace pending hover geometry", () => {
    const first = trackedElement("first");
    const second = trackedElement("second");
    const firstRect = vi.spyOn(first, "getBoundingClientRect");
    const secondRect = vi.spyOn(second, "getBoundingClientRect");
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);

    dispatchMouseOver(first);
    dispatchMouseOver(second);
    dispatchMouseOut(second, document.body);

    expect(scheduled).toHaveLength(1);
    runScheduledFrame();

    expect(firstRect).not.toHaveBeenCalled();
    expect(secondRect).not.toHaveBeenCalled();
    expect(hoverMessages(postMessage)).toHaveLength(1);
    expect(hoverMessages(postMessage)[0]).toMatchObject({
      cid: "second",
      rect: null,
      margins: null,
      borders: null,
    });
  });

  it("marks a Shift-click as additive in the element-click protocol", () => {
    const button = trackedElement("shift-target");
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);

    button.dispatchEvent(new MouseEvent("click", {
      bubbles: true,
      cancelable: true,
      shiftKey: true,
    }));

    const click = postMessage.mock.calls
      .map(([message]) => message)
      .find((message) => typeof message === "object" && message !== null && "type" in message && message.type === "element-click");
    expect(click).toMatchObject({ type: "element-click", additive: true });
  });

  it("reports spacing affordances and routes their drag through the element protocol", () => {
    const element = trackedElement("spacing-target");
    element.style.cursor = "crosshair";
    element.style.paddingTop = "20px";
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      left: 10,
      top: 10,
      width: 200,
      height: 120,
      right: 210,
      bottom: 130,
    } as DOMRect);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => element,
    });
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);

    element.dispatchEvent(new MouseEvent("mouseover", {
      bubbles: true,
      clientX: 100,
      clientY: 20,
    }));
    runScheduledFrame();

    expect(hoverMessages(postMessage)[0]).toMatchObject({
      spacing: { kind: "padding", property: "padding-top", side: "top" },
      point: { x: 100, y: 20 },
    });
    expect(document.documentElement.style.cursor).toBe("ns-resize");
    expect(element.style.getPropertyValue("cursor")).toBe("ns-resize");
    expect(element.style.getPropertyPriority("cursor")).toBe("important");

    element.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      clientX: 100,
      clientY: 20,
    }));
    document.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 32,
    }));
    document.dispatchEvent(new MouseEvent("mouseup", {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 32,
    }));

    expect(postMessage.mock.calls.map(([message]) => message)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "element-drag-start",
        startPoint: { x: 100, y: 20 },
        spacing: { kind: "padding", property: "padding-top", side: "top" },
      }),
      expect.objectContaining({ type: "element-drag-end", point: { x: 100, y: 32 } }),
    ]));
    expect(postMessage.mock.calls.map(([message]) => message)
      .some((message) => typeof message === "object"
        && message !== null
        && "type" in message
        && message.type === "inline-text-intent")).toBe(false);

    element.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
    runScheduledFrame();
    expect(element.style.cursor).toBe("crosshair");
  });

  it("cancels an active spacing drag when renderer interactions are suspended", () => {
    const element = trackedElement("cancelled-spacing-target");
    element.style.paddingTop = "20px";
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      left: 10,
      top: 10,
      width: 200,
      height: 120,
      right: 210,
      bottom: 130,
    } as DOMRect);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => element,
    });
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);

    element.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      clientX: 100,
      clientY: 20,
    }));
    document.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 32,
    }));
    window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin,
      source: window.parent,
      data: {
        type: "inspector-interaction-state",
        protocolVersion: PROTOCOL_VERSION,
        open: false,
        ...identity,
      },
    }));

    expect(postMessage.mock.calls.map(([message]) => message)).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "element-drag-end",
        cancelled: true,
        point: { x: 100, y: 32 },
      }),
    ]));
  });

  it("forwards double-click text intent to the controller", () => {
    const heading = trackedElement("editable-heading");
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);

    heading.dispatchEvent(new MouseEvent("dblclick", {
      bubbles: true,
      cancelable: true,
      clientX: 12,
      clientY: 24,
    }));

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "inline-text-intent",
      intent: "double-click",
      cid: "editable-heading",
      point: { x: 12, y: 24 },
    }), window.location.origin);
  });

  it("forwards the visibility shortcut and restores native app clicks while hidden", () => {
    const button = trackedElement("app-action");
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
    const shortcut = new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Backslash",
      key: "\\",
      ctrlKey: true,
    });

    document.dispatchEvent(shortcut);
    window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin,
      source: window.parent,
      data: {
        type: "inspector-interaction-state",
        protocolVersion: PROTOCOL_VERSION,
        open: false,
        ...identity,
      },
    }));
    expect(document.documentElement.hasAttribute("data-nudge-ui-panel")).toBe(false);
    const click = new MouseEvent("click", { bubbles: true, cancelable: true });
    button.dispatchEvent(click);

    expect(shortcut.defaultPrevented).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "inspector-toggle-request",
    }), window.location.origin);
    expect(click.defaultPrevented).toBe(false);

    postMessage.mockClear();
    const hiddenPanelSelection = new MouseEvent("click", { bubbles: true, cancelable: true });
    window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin,
      source: window.parent,
      data: {
        type: "inspector-interaction-state",
        protocolVersion: PROTOCOL_VERSION,
        open: false,
        interactionsEnabled: true,
        ...identity,
      },
    }));
    button.dispatchEvent(hiddenPanelSelection);
    expect(hiddenPanelSelection.defaultPrevented).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "element-click",
      cid: "app-action",
    }), window.location.origin);

    window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin,
      source: window.parent,
      data: {
        type: "inspector-interaction-state",
        protocolVersion: PROTOCOL_VERSION,
        open: true,
        ...identity,
      },
    }));
    expect(document.documentElement.getAttribute("data-nudge-ui-panel")).toBe("open");

    postMessage.mockClear();
    window.dispatchEvent(new Event("nudge-ui:open"));
    window.dispatchEvent(new Event("nudge-ui:open"));
    expect(postMessage).toHaveBeenCalledTimes(2);
    expect(postMessage).toHaveBeenNthCalledWith(1, expect.objectContaining({
      type: "inspector-open-request",
    }), window.location.origin);
    expect(postMessage).toHaveBeenNthCalledWith(2, expect.objectContaining({
      type: "inspector-open-request",
    }), window.location.origin);
  });

  it("forwards canvas tool shortcuts from the iframe and ignores editable targets", () => {
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);

    document.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "KeyV",
      key: "v",
    }));
    document.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "KeyH",
      key: "h",
    }));
    document.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "KeyP",
      key: "p",
    }));
    document.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "KeyS",
      key: "s",
      shiftKey: true,
    }));
    document.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "Backslash",
      key: "\\",
    }));
    document.dispatchEvent(new KeyboardEvent("keyup", {
      bubbles: true,
      cancelable: true,
      code: "Backslash",
      key: "\\",
    }));

    const shortcuts = postMessage.mock.calls
      .map(([message]) => message)
      .filter((message): message is { type: string; phase: string; code: string } => (
        typeof message === "object"
        && message !== null
        && "type" in message
        && message.type === "keyboard-shortcut"
      ));
    expect(shortcuts).toEqual([
      expect.objectContaining({ phase: "keydown", code: "KeyV" }),
      expect.objectContaining({ phase: "keydown", code: "KeyH" }),
      expect.objectContaining({ phase: "keydown", code: "KeyP" }),
      expect.objectContaining({ phase: "keydown", code: "KeyS" }),
      expect.objectContaining({ phase: "keydown", code: "Backslash" }),
      expect.objectContaining({ phase: "keyup", code: "Backslash" }),
    ]);

    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    input.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      code: "KeyV",
      key: "v",
    }));
    expect(postMessage.mock.calls
      .map(([message]) => message)
      .filter((message) => typeof message === "object" && message !== null && "type" in message && message.type === "keyboard-shortcut"))
      .toHaveLength(6);
    input.remove();
  });

  it("accepts Alt state from the parent when the iframe is not focused", () => {
    const button = trackedElement("measure-target");
    dispatchMouseOver(button);
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
    postMessage.mockClear();

    window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin,
      source: window.parent,
      data: {
        type: "measure-modifier",
        protocolVersion: PROTOCOL_VERSION,
        altKey: true,
        ...identity,
      },
    }));

    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "element-measure-state",
      altKey: true,
      pointerOverPage: true,
    }), window.location.origin);
  });
});

describe("renderer selector lifecycle", () => {
  it("cancels an active drag before renderer teardown", () => {
    const element = trackedElement("teardown-spacing");
    element.style.paddingTop = "20px";
    vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
      left: 10,
      top: 10,
      width: 200,
      height: 120,
      right: 210,
      bottom: 130,
    } as DOMRect);
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: () => element,
    });
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);

    element.dispatchEvent(new MouseEvent("mousedown", {
      bubbles: true,
      button: 0,
      clientX: 100,
      clientY: 20,
    }));
    document.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      cancelable: true,
      clientX: 100,
      clientY: 32,
    }));

    disposeRendererElementSelector();

    expect(postMessage.mock.calls.map(([message]) => message)).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "element-drag-end", cancelled: true }),
    ]));
  });

  it("removes listeners and suppresses queued callbacks after disposal", () => {
    const button = trackedElement("disposed");
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);

    dispatchMouseOver(button);
    expect(scheduled).toHaveLength(1);
    expect(document.head.querySelector("style#nudge-ui-interaction-styles")).not.toBeNull();
    postMessage.mockClear();
    document.documentElement.setAttribute("data-nudge-ui-panel", "open");

    disposeRendererElementSelector();
    disposeRendererElementSelector();
    expect(document.documentElement.hasAttribute("data-nudge-ui-panel")).toBe(false);
    runScheduledFrame();

    button.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    button.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    document.dispatchEvent(new MouseEvent("mousemove", {
      bubbles: true,
      clientX: 20,
      clientY: 20,
    }));
    document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, clientX: 20, clientY: 20 }));
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,
      cancelable: true,
      ctrlKey: true,
      key: "z",
    }));
    document.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true, key: "Alt" }));
    window.dispatchEvent(new Event("blur"));

    expect(postMessage).not.toHaveBeenCalled();
    expect(document.head.querySelector("style#nudge-ui-interaction-styles")).toBeNull();
  });

  it("can install again after disposal", () => {
    disposeRendererElementSelector();
    scheduled.length = 0;
    disposeRendererElementSelector = installRendererElementSelector();

    const button = trackedElement("reinstalled");
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);
    dispatchMouseOver(button);

    expect(scheduled).toHaveLength(1);
    runScheduledFrame();

    expect(hoverMessages(postMessage)).toHaveLength(1);
    expect(hoverMessages(postMessage)[0]).toMatchObject({ cid: "reinstalled" });
  });
});

describe("renderer keyboard selection", () => {
  it("forwards Escape to the controller and forgets the renderer selection", () => {
    const button = trackedElement("button");
    const postMessage = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined);

    button.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));

    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(escape);

    expect(escape.defaultPrevented).toBe(true);
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({
      type: "element-deselect",
      protocolVersion: expect.any(Number),
      ...identity,
    }), window.location.origin);

    const deleteKey = new KeyboardEvent("keydown", {
      key: "Delete",
      bubbles: true,
      cancelable: true,
    });
    button.dispatchEvent(deleteKey);

    expect(postMessage.mock.calls.some(([message]) => (
      typeof message === "object"
      && message !== null
      && "type" in message
      && message.type === "element-delete"
    ))).toBe(false);
  });
});
