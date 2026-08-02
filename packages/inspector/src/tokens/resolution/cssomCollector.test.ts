// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  collectRules,
  declarationsFromCssom,
  documentRevisions,
  getGlobalRevision,
  invalidateStyleResolutionCache,
  registerResolutionElement,
  subscribeGlobalRevision,
} from "./cssomCollector.ts";

function flushObserver(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function revisionsSnapshot(): { element: number; stylesheet: number } {
  return { ...documentRevisions(document) };
}

describe("CSSOM collector", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    invalidateStyleResolutionCache(document);
  });

  it("assigns selector specificity as part of collection", () => {
    const style = document.createElement("style");
    style.textContent = ".subject, #subject { color: red; }";
    document.head.appendChild(style);

    const rule = collectRules(document).rules[0];

    expect(rule).toMatchObject({
      selectorText: ".subject, #subject",
      specificity: 1_000_000,
      declarations: [{ property: "color", value: "red", important: false }],
    });
  });

  it("reads serialized CSSOM shorthands before indexed longhand expansion", () => {
    const style = document.createElement("div").style;
    style.setProperty("--space-4", "clamp(8px, 2vw, 24px)");
    style.setProperty("padding-inline", "var(--space-4)", "important");
    style.setProperty("font", "italic 600 1.25rem/1.5 var(--font-family)");

    expect(declarationsFromCssom(style)).toEqual([
      { property: "--space-4", value: "clamp(8px, 2vw, 24px)", important: false },
      { property: "padding-inline", value: "var(--space-4)", important: true },
      { property: "font", value: "italic 600 1.25rem/1.5 var(--font-family)", important: false },
    ]);
  });

  it("uses a CSSOM mutation as the declaration source", () => {
    const style = document.createElement("style");
    style.textContent = ".subject { color: red; }";
    document.head.appendChild(style);

    const rule = style.sheet?.cssRules[0];
    expect(rule).toBeInstanceOf(CSSStyleRule);
    (rule as CSSStyleRule).style.setProperty("color", "blue");
    invalidateStyleResolutionCache(document);

    expect(collectRules(document).rules[0]?.declarations).toEqual([
      { property: "color", value: "blue", important: false },
    ]);
  });

  it("retains a media query prelude on its nested style rules", () => {
    const matchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: () => ({ matches: true }),
    });
    const style = document.createElement("style");
    style.textContent = "@media (min-width: 1px) { .subject { font-size: 17px; } }";
    document.head.appendChild(style);

    expect(collectRules(document).rules).toContainEqual(expect.objectContaining({
      selectorText: ".subject",
      active: true,
      atRules: [{ kind: "media", params: "(min-width: 1px)" }],
    }));

    Object.defineProperty(window, "matchMedia", { configurable: true, value: matchMedia });
  });

  it("retains an active supports prelude on its nested style rules", () => {
    const cssDescriptor = Object.getOwnPropertyDescriptor(window, "CSS");
    Object.defineProperty(window, "CSS", {
      configurable: true,
      value: { supports: () => true },
    });
    const style = document.createElement("style");
    style.textContent = "@supports (display: grid) { .subject { display: grid; } }";
    document.head.appendChild(style);

    expect(collectRules(document).rules).toContainEqual(expect.objectContaining({
      selectorText: ".subject",
      active: true,
      atRules: [{ kind: "supports", params: "(display: grid)" }],
    }));

    if (cssDescriptor) Object.defineProperty(window, "CSS", cssDescriptor);
    else delete (window as unknown as { CSS?: unknown }).CSS;
  });
});

describe("document revision observer", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    invalidateStyleResolutionCache(document);
  });

  it("ignores insertions and removals of the tool's own probe nodes", async () => {
    const before = revisionsSnapshot();

    const attribution = document.createElement("div");
    attribution.setAttribute("data-design-tool", "attribution-probe");
    document.body.appendChild(attribution);
    attribution.remove();

    const container = document.createElement("style");
    container.setAttribute("data-design-tool", "container-probe");
    container.textContent = "@container (min-width: 1px) { [data-dt-probe] { --p: 1; } }";
    document.head.appendChild(container);
    container.remove();

    const value = document.createElement("span");
    value.setAttribute("data-design-tool", "value-probe");
    document.body.appendChild(value);
    value.remove();

    await flushObserver();
    expect(revisionsSnapshot()).toEqual(before);
  });

  it("counts managed-sheet writes as stylesheet changes", async () => {
    const managed = document.createElement("style");
    managed.setAttribute("data-design-tool", "managed");
    managed.id = "design-tool-styles";
    document.head.appendChild(managed);
    await flushObserver();

    const before = revisionsSnapshot();
    managed.textContent = ".dt-row { color: red; }";
    managed.textContent = ".dt-row { color: blue; }";
    await flushObserver();
    expect(revisionsSnapshot().stylesheet).toBeGreaterThan(before.stylesheet);
  });

  it("ignores attribute churn on elements outside the resolution registry", async () => {
    const busy = document.createElement("div");
    busy.setAttribute("data-busy", "1");
    document.body.appendChild(busy);
    await flushObserver();

    const before = revisionsSnapshot();
    busy.setAttribute("data-busy", "2");
    busy.removeAttribute("data-busy");
    busy.className = "changing";
    await flushObserver();
    expect(revisionsSnapshot()).toEqual(before);
  });

  it("ignores renderer identity attributes before an element is registered", async () => {
    const canvasNode = document.createElement("div");
    document.body.appendChild(canvasNode);
    await flushObserver();

    const before = revisionsSnapshot();
    canvasNode.setAttribute("data-dt-renderer-id", "r1");
    canvasNode.setAttribute("data-dt-renderer-id", "r2");
    await flushObserver();

    expect(revisionsSnapshot()).toEqual(before);
  });

  it("counts attribute changes on registered resolution elements", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    await flushObserver();

    const before = revisionsSnapshot();
    registerResolutionElement(el);
    el.className = "changed";
    await flushObserver();

    const after = revisionsSnapshot();
    expect(after.element).toBeGreaterThan(before.element);
    expect(after.stylesheet).toBe(before.stylesheet);
  });

  it("ignores the container-query marker attribute on registered elements", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    await flushObserver();
    registerResolutionElement(el);

    const before = revisionsSnapshot();
    el.setAttribute("data-dt-container-probe-3", "");
    el.removeAttribute("data-dt-container-probe-3");
    await flushObserver();
    expect(revisionsSnapshot()).toEqual(before);
  });

  it("counts a host style element textContent change as a stylesheet revision", async () => {
    const style = document.createElement("style");
    style.textContent = ".a { color: red; }";
    document.head.appendChild(style);
    await flushObserver();

    const before = revisionsSnapshot();
    style.textContent = ".a { color: blue; }";
    await flushObserver();

    const after = revisionsSnapshot();
    expect(after.stylesheet).toBeGreaterThan(before.stylesheet);
  });

  it("counts stylesheet attribute changes even when the stylesheet is unregistered", async () => {
    const style = document.createElement("style");
    style.textContent = ".a { color: red; }";
    document.head.appendChild(style);
    await flushObserver();

    const before = revisionsSnapshot();
    style.media = "screen and (min-width: 1px)";
    await flushObserver();

    const after = revisionsSnapshot();
    expect(after.stylesheet).toBeGreaterThan(before.stylesheet);
  });

  it("counts childList structure changes even when no registered element is involved", async () => {
    const before = revisionsSnapshot();
    const node = document.createElement("div");
    document.body.appendChild(node);
    node.remove();
    await flushObserver();
    const after = revisionsSnapshot();
    expect(after.element).toBeGreaterThan(before.element);
  });

  it("bumps the global revision and notifies subscribers on relevant mutations", async () => {
    const before = getGlobalRevision();
    const seen: number[] = [];
    const unsub = subscribeGlobalRevision(() => seen.push(getGlobalRevision()));
    const node = document.createElement("div");
    document.body.appendChild(node);
    await flushObserver();
    expect(getGlobalRevision()).toBeGreaterThan(before);
    expect(seen.length).toBeGreaterThan(0);
    unsub();
  });

  it("bumps the global revision on explicit invalidation", () => {
    const before = getGlobalRevision();
    const seen: number[] = [];
    const unsub = subscribeGlobalRevision(() => seen.push(getGlobalRevision()));
    invalidateStyleResolutionCache(document);
    expect(getGlobalRevision()).toBeGreaterThan(before);
    expect(seen).toHaveLength(1);
    unsub();
  });
});
