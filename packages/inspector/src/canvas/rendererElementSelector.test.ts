// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setRendererIdentity, type ElementHoverMessage } from "./frameProtocol.ts";
import { buildSelector, installRendererElementSelector } from "./rendererElementSelector.ts";
import { setNudgeUiHostDevFlag } from "../devFlag.ts";

const identity = {
  projectId: "project-a",
  workspaceId: "workspace-a",
  cardId: "card-a",
};

const scheduled: FrameRequestCallback[] = [];
const originalRequestAnimationFrame = window.requestAnimationFrame;
const originalCancelAnimationFrame = window.cancelAnimationFrame;

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
  installRendererElementSelector();
});

beforeEach(() => {
  setRendererIdentity(identity);
  scheduled.length = 0;
});

afterEach(() => {
  while (scheduled.length > 0) runScheduledFrame();
  vi.restoreAllMocks();
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
});
