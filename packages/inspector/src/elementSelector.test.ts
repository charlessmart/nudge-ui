// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getSelectedElement,
  setSelectedElement,
} from "./selectionStore.ts";
import { setInspectorOpen } from "./openStore.ts";
import { installElementSelector } from "./elementSelector.ts";
import {
  parseDataSrc,
  resolveSelectionFromEvent,
} from "./resolveSelection.ts";

function dispatchClick(target: EventTarget, init: MouseEventInit = {}): MouseEvent {
  const event = new MouseEvent("click", {
    bubbles: true,
    composed: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
}

function makeHostElement(
  attrs: Record<string, string> = {},
): HTMLElement {
  const el = document.createElement("div");
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

describe("parseDataSrc", () => {
  it("parses file:line:column", () => {
    expect(parseDataSrc("/path/Button.tsx:12:5")).toEqual({
      file: "/path/Button.tsx",
      line: 12,
      column: 5,
    });
  });
  it("returns null when the pattern does not match", () => {
    expect(parseDataSrc("no-colons-here")).toBeNull();
  });
  it("returns null for empty string", () => {
    expect(parseDataSrc("")).toBeNull();
  });
  it("returns null for file:line (missing column)", () => {
    expect(parseDataSrc("Button.tsx:42")).toBeNull();
  });
  it("returns null when line/column are not numbers", () => {
    expect(parseDataSrc("Button.tsx:abc:def")).toBeNull();
  });
});

describe("resolveSelectionFromEvent", () => {
  let host: HTMLDivElement;

  beforeEach(() => {
    host = document.createElement("div");
    host.id = "design-tool-root";
    document.body.appendChild(host);
  });
  afterEach(() => {
    document.body.innerHTML = "";
    setSelectedElement(null);
  });

  it("resolves a target with data-cid/data-src/data-cprops", () => {
    const el = makeHostElement({
      "data-cid": "Button",
      "data-src": "/path/Button.tsx:12:5",
      "data-cprops": "variant:primary",
    });
    document.body.appendChild(el);
    const event = {
      target: el,
    } as unknown as MouseEvent;
    const sel = resolveSelectionFromEvent(event, host);
    expect(sel).not.toBeNull();
    expect(sel!.cid).toBe("Button");
    expect(sel!.file).toBe("/path/Button.tsx");
    expect(sel!.line).toBe(12);
    expect(sel!.column).toBe(5);
    expect(sel!.cprops).toBe("variant:primary");
    expect(sel!.domElement).toBe(el);
  });

  it("returns null when no ancestor has data-cid", () => {
    const el = makeHostElement();
    document.body.appendChild(el);
    const event = { target: el } as unknown as MouseEvent;
    expect(resolveSelectionFromEvent(event, host)).toBeNull();
  });

  it("returns null when target is the inspector host", () => {
    const inner = document.createElement("span");
    host.appendChild(inner);
    const event = { target: inner } as unknown as MouseEvent;
    expect(resolveSelectionFromEvent(event, host)).toBeNull();
  });

  it("walks up to the nearest ancestor with data-cid", () => {
    const parent = makeHostElement({
      "data-cid": "Card",
      "data-src": "Card.tsx:1:1",
    });
    const child = document.createElement("span");
    parent.appendChild(child);
    document.body.appendChild(parent);
    const event = { target: child } as unknown as MouseEvent;
    const sel = resolveSelectionFromEvent(event, host);
    expect(sel?.cid).toBe("Card");
    expect(sel?.domElement).toBe(parent);
  });

  it("prefers an interactive parent over a full-bleed tracked child", () => {
    const button = document.createElement("button");
    button.setAttribute("data-cid", "Button");
    button.setAttribute("data-src", "Button.tsx:1:1");
    const label = makeHostElement({
      "data-cid": "ButtonLabel",
      "data-src": "Button.tsx:2:1",
    });
    button.appendChild(label);
    document.body.appendChild(button);

    const sel = resolveSelectionFromEvent({ target: label } as unknown as MouseEvent, host);
    expect(sel?.domElement).toBe(button);
  });

  it("uses the deepest tracked child for Ctrl or Command clicks", () => {
    const button = makeHostElement({
      "data-cid": "Button",
      "data-src": "Button.tsx:1:1",
    });
    const label = makeHostElement({
      "data-cid": "ButtonLabel",
      "data-src": "Button.tsx:2:1",
    });
    button.appendChild(label);
    document.body.appendChild(button);

    const sel = resolveSelectionFromEvent(
      { target: label, ctrlKey: true } as unknown as MouseEvent,
      host,
    );
    expect(sel?.domElement).toBe(label);
  });

  it("captures a React fiber when the key is present", () => {
    const el = makeHostElement({
      "data-cid": "Button",
      "data-src": "Button.tsx:1:1",
    });
    const fiber = { _debugSource: { fileName: "Button.tsx" } };
    (el as unknown as Record<string, unknown>)["__reactFiber$abc"] = fiber;
    document.body.appendChild(el);
    const event = { target: el } as unknown as MouseEvent;
    const sel = resolveSelectionFromEvent(event, host);
    expect(sel?.fiber).toBe(fiber);
  });

  it("returns undefined fiber when no React key is present", () => {
    const el = makeHostElement({
      "data-cid": "Button",
      "data-src": "Button.tsx:1:1",
    });
    document.body.appendChild(el);
    const event = { target: el } as unknown as MouseEvent;
    const sel = resolveSelectionFromEvent(event, host);
    expect(sel?.fiber).toBeUndefined();
  });
});

describe("installElementSelector", () => {
  let host: HTMLDivElement;
  let uninstall: () => void;

  beforeEach(() => {
    host = document.createElement("div");
    host.id = "design-tool-root";
    document.body.appendChild(host);
    setInspectorOpen(true);
    uninstall = installElementSelector(host);
  });
  afterEach(() => {
    uninstall();
    document.body.innerHTML = "";
    setSelectedElement(null);
    setInspectorOpen(true);
  });

  it("selects on click of a host element with data-cid", () => {
    const el = makeHostElement({
      "data-cid": "Button",
      "data-src": "/path/Button.tsx:12:5",
      "data-cprops": "variant:primary",
    });
    document.body.appendChild(el);
    dispatchClick(el);
    const sel = getSelectedElement();
    expect(sel?.cid).toBe("Button");
    expect(sel?.file).toBe("/path/Button.tsx");
    expect(sel?.line).toBe(12);
    expect(sel?.column).toBe(5);
    expect(sel?.cprops).toBe("variant:primary");
  });



  it("does not select or interfere with clicks inside the inspector host", () => {
    const inner = document.createElement("button");
    const onInspectorClick = vi.fn();
    inner.addEventListener("click", onInspectorClick);
    host.appendChild(inner);

    const event = dispatchClick(inner);

    // The inspector's own controls must keep their native behavior: the
    // capture selector neither selects nor swallows their clicks.
    expect(getSelectedElement()).toBeNull();
    expect(onInspectorClick).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(false);
  });

  it("lets clicks inside the inspector's shadow root reach their targets", () => {
    // Real browser clicks are composed; a click on a node inside the open
    // shadow root propagates through the host up to document, where it is
    // observed retargeted to the host. The selector must let it through.
    const shadow = host.attachShadow({ mode: "open" });
    const button = document.createElement("button");
    const onInspectorClick = vi.fn();
    button.addEventListener("click", onInspectorClick);
    shadow.appendChild(button);

    const event = dispatchClick(button);

    expect(getSelectedElement()).toBeNull();
    expect(onInspectorClick).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(false);
  });

  it("does not fire when the inspector is closed", () => {
    setInspectorOpen(false);
    const el = makeHostElement({
      "data-cid": "Button",
      "data-src": "Button.tsx:1:1",
    });
    document.body.appendChild(el);
    const event = new MouseEvent("click", {
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    Object.defineProperty(event, "target", { value: el });
    const spy = vi.spyOn(event, "preventDefault");
    document.dispatchEvent(event);
    expect(getSelectedElement()).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("prevents default and stops propagation when selecting", () => {
    const el = makeHostElement({
      "data-cid": "Button",
      "data-src": "Button.tsx:1:1",
    });
    document.body.appendChild(el);
    const event = new MouseEvent("click", {
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    Object.defineProperty(event, "target", { value: el });
    const prevent = vi.spyOn(event, "preventDefault");
    const stop = vi.spyOn(event, "stopPropagation");
    document.dispatchEvent(event);
    expect(prevent).toHaveBeenCalled();
    expect(stop).toHaveBeenCalled();
  });

  it("selects links and blocks their application behavior", () => {
    const link = document.createElement("a");
    link.href = "/conformance";
    link.setAttribute("data-cid", "RouteLink");
    link.setAttribute("data-src", "App.tsx:1:1");
    const onApplicationClick = vi.fn();
    link.addEventListener("click", onApplicationClick);
    document.body.appendChild(link);

    const event = dispatchClick(link);

    expect(getSelectedElement()?.domElement).toBe(link);
    expect(event.defaultPrevented).toBe(true);
    expect(onApplicationClick).not.toHaveBeenCalled();
  });

  it.each([
    { name: "Command", init: { metaKey: true } },
    { name: "Ctrl", init: { ctrlKey: true } },
  ])("lets $name-click follow a link", ({ init }) => {
    const link = document.createElement("a");
    link.href = "/conformance";
    link.setAttribute("data-cid", "RouteLink");
    link.setAttribute("data-src", "App.tsx:1:1");
    document.body.appendChild(link);
    const allowBrowserNavigation = vi.fn((event: MouseEvent) => event.preventDefault());
    document.addEventListener("click", allowBrowserNavigation);

    const event = dispatchClick(link, init);

    expect(getSelectedElement()).toBeNull();
    expect(allowBrowserNavigation).toHaveBeenCalledOnce();
    expect(event.defaultPrevented).toBe(true);
    document.removeEventListener("click", allowBrowserNavigation);
  });

  it("blocks clicks on untracked application controls", () => {
    const button = document.createElement("button");
    const onApplicationClick = vi.fn();
    button.addEventListener("click", onApplicationClick);
    document.body.appendChild(button);

    const event = dispatchClick(button);

    expect(getSelectedElement()).toBeNull();
    expect(event.defaultPrevented).toBe(true);
    expect(onApplicationClick).not.toHaveBeenCalled();
  });
});
