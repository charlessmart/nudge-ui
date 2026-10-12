// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectRules,
  declarationsFromCssom,
  disposeDocumentResolution,
  documentRevisions,
  invalidateOwnedStyleResolution,
  invalidateStyleResolutionCache,
  registerResolutionElement,
  subscribeDocumentRevision,
} from "./cssomCollector.ts";

function flushObserver(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function revisionsSnapshot() {
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

describe("page stylesheet walk reuse", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    invalidateStyleResolutionCache(document);
  });

  function pageAndManagedSheets(): { page: HTMLStyleElement; managed: HTMLStyleElement } {
    const page = document.createElement("style");
    page.textContent = ".page { color: red; } .second { color: green; }";
    const managed = document.createElement("style");
    managed.id = "nudge-ui-styles";
    managed.setAttribute("data-nudge-ui", "managed");
    managed.textContent = ".managed { color: blue; }";
    document.head.append(page, managed);
    return { page, managed };
  }

  it("keeps page rules and re-reads only inspector-owned sheets after an owned write", () => {
    const { managed } = pageAndManagedSheets();
    const before = collectRules(document).rules;

    managed.textContent = ".managed { color: purple; }";
    invalidateOwnedStyleResolution(document);
    const after = collectRules(document);

    expect(after.rules).not.toBe(before);
    expect(after.rules[0]!.declarations).toBe(before[0]!.declarations);
    expect(after.rules.map(({ selectorText, sourceOrder }) => ({ selectorText, sourceOrder }))).toEqual([
      { selectorText: ".page", sourceOrder: 0 },
      { selectorText: ".second", sourceOrder: 1 },
      { selectorText: ".managed", sourceOrder: 2 },
    ]);
    expect(after.rules[2]!.declarations).toEqual([{ property: "color", value: "purple", important: false }]);
  });

  it("re-reads a page sheet whose rule count changed", () => {
    const { page } = pageAndManagedSheets();
    collectRules(document);

    page.sheet!.insertRule(".inserted { color: orange; }", 1);
    invalidateOwnedStyleResolution(document);

    expect(collectRules(document).rules.map((rule) => rule.selectorText))
      .toEqual([".page", ".inserted", ".second", ".managed"]);
  });

  it("re-reads page sheets after a general invalidation", () => {
    pageAndManagedSheets();
    const before = collectRules(document).rules;

    invalidateStyleResolutionCache(document);

    expect(collectRules(document).rules[0]!.declarations).not.toBe(before[0]!.declarations);
  });

  it("re-reads a page sheet when a media condition it evaluated changes", () => {
    const matchMedia = window.matchMedia;
    let matches = true;
    Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches }) });
    const style = document.createElement("style");
    style.textContent = "@media (min-width: 600px) { .wide { color: red; } }";
    document.head.append(style);
    expect(collectRules(document).rules[0]!.active).toBe(true);

    matches = false;
    invalidateOwnedStyleResolution(document);

    expect(collectRules(document).rules[0]!.active).toBe(false);
    Object.defineProperty(window, "matchMedia", { configurable: true, value: matchMedia });
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
    attribution.setAttribute("data-nudge-ui", "attribution-probe");
    document.body.appendChild(attribution);
    attribution.remove();

    const container = document.createElement("style");
    container.setAttribute("data-nudge-ui", "container-probe");
    container.textContent = "@container (min-width: 1px) { [data-probe] { --p: 1; } }";
    document.head.appendChild(container);
    container.remove();

    const value = document.createElement("span");
    value.setAttribute("data-nudge-ui", "value-probe");
    document.body.appendChild(value);
    value.remove();

    await flushObserver();
    expect(revisionsSnapshot()).toEqual(before);
  });

  it("counts managed-sheet writes as stylesheet changes", async () => {
    const managed = document.createElement("style");
    managed.setAttribute("data-nudge-ui", "managed");
    managed.id = "nudge-ui-styles";
    document.head.appendChild(managed);
    await flushObserver();

    const before = revisionsSnapshot();
    managed.textContent = ".row { color: red; }";
    managed.textContent = ".row { color: blue; }";
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
    canvasNode.setAttribute("data-renderer-id", "r1");
    canvasNode.setAttribute("data-renderer-id", "r2");
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
    el.setAttribute("data-container-probe-3", "");
    el.removeAttribute("data-container-probe-3");
    await flushObserver();
    expect(revisionsSnapshot()).toEqual(before);
  });

  it("ignores renderer cursor writes to registered elements' inline style", async () => {
    const el = document.createElement("div");
    el.style.color = "red";
    document.body.appendChild(el);
    await flushObserver();
    registerResolutionElement(el);

    const before = revisionsSnapshot();
    el.style.setProperty("cursor", "ew-resize", "important");
    el.style.setProperty("--nudge-ui-interaction-cursor", "pointer");
    el.style.removeProperty("cursor");
    await flushObserver();
    expect(revisionsSnapshot()).toEqual(before);

    el.style.color = "blue";
    await flushObserver();
    expect(revisionsSnapshot().element).toBeGreaterThan(before.element);
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

  it("notifies only subscribers for the document whose cascade changed", () => {
    const otherDocument = document.implementation.createHTMLDocument("other");
    const seen: number[] = [];
    const unsubscribe = subscribeDocumentRevision(document, (revisions) => seen.push(revisions.stylesheet));
    const otherUnsubscribe = subscribeDocumentRevision(otherDocument, () => seen.push(-1));

    invalidateStyleResolutionCache(document);

    expect(seen).toHaveLength(1);
    expect(seen[0]).toBe(documentRevisions(document).stylesheet);

    unsubscribe();
    otherUnsubscribe();
  });

  it("stops a disposed document session from publishing mutation or resize revisions", async () => {
    const oldRevisions = documentRevisions(document);
    const published = vi.fn();
    const unsubscribe = subscribeDocumentRevision(document, published);
    const beforeDisposal = { ...oldRevisions };

    disposeDocumentResolution(document);

    // Disposal bumps the monotonic counters once to invalidate pre-disposal
    // revision-keyed caches, then disconnects the observer.
    expect(oldRevisions).toEqual({
      element: beforeDisposal.element + 1,
      stylesheet: beforeDisposal.stylesheet + 1,
    });
    const afterDisposal = { ...oldRevisions };

    document.body.appendChild(document.createElement("div"));
    window.dispatchEvent(new Event("resize"));
    await flushObserver();

    expect(oldRevisions).toEqual(afterDisposal);
    expect(published).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("keeps revision counters monotonic across document disposal", async () => {
    const oldRevisions = documentRevisions(document);
    const beforeInvalidation = { ...oldRevisions };
    invalidateStyleResolutionCache(document);
    expect(oldRevisions).toEqual({
      element: beforeInvalidation.element + 1,
      stylesheet: beforeInvalidation.stylesheet + 1,
    });
    const beforeDisposal = { ...oldRevisions };

    disposeDocumentResolution(document);

    const freshRevisions = documentRevisions(document);
    // Monotonic, never reset: disposal invalidates caches by advancing past
    // every pre-disposal (element, stylesheet) pair instead of restarting at
    // (0,0) where a stale cache entry would hit immediately.
    expect(freshRevisions).toEqual({
      element: beforeDisposal.element + 1,
      stylesheet: beforeDisposal.stylesheet + 1,
    });

    document.body.appendChild(document.createElement("div"));
    await flushObserver();
    expect(freshRevisions.element).toBeGreaterThan(beforeDisposal.element + 1);
  });

  it("keeps listener unsubscription safe across document sessions", () => {
    documentRevisions(document);
    const oldListener = vi.fn();
    const unsubscribeOld = subscribeDocumentRevision(document, oldListener);

    disposeDocumentResolution(document);

    documentRevisions(document);
    const newListener = vi.fn();
    const unsubscribeNew = subscribeDocumentRevision(document, newListener);

    expect(() => unsubscribeOld()).not.toThrow();
    invalidateStyleResolutionCache(document);

    expect(oldListener).not.toHaveBeenCalled();
    expect(newListener).toHaveBeenCalledTimes(1);
    expect(() => unsubscribeNew()).not.toThrow();
    expect(() => unsubscribeNew()).not.toThrow();
  });
});
