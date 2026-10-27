// @vitest-environment jsdom
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { enablePageSurface } from "../../canvas/pageSurface.ts";
import {
  documentRevisions,
  invalidateStyleResolutionCache,
  registerResolutionElement,
  registerResolutionLineage,
} from "./cssomCollector.ts";

function flushObserver(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function revisionsSnapshot() {
  return { ...documentRevisions(document) };
}

describe("document revisions on the page surface", () => {
  // Each test file runs in its own module graph, so this does not reach the host-adapter suites.
  beforeAll(() => {
    enablePageSurface();
  });

  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    invalidateStyleResolutionCache(document);
  });

  it("ignores child list changes outside the inspected lineage", async () => {
    const stream = document.createElement("div");
    document.body.appendChild(stream);
    await flushObserver();

    const before = revisionsSnapshot();
    const message = document.createElement("p");
    stream.appendChild(message);
    message.remove();
    await flushObserver();

    expect(revisionsSnapshot()).toEqual(before);
  });

  it("ignores text that changes in place", async () => {
    const counter = document.createElement("span");
    counter.textContent = "0";
    document.body.appendChild(counter);
    await flushObserver();

    const before = revisionsSnapshot();
    (counter.firstChild as Text).data = "1";
    await flushObserver();

    expect(revisionsSnapshot()).toEqual(before);
  });

  it("counts text that changes inside the inspected lineage", async () => {
    const label = document.createElement("span");
    label.textContent = "0";
    document.body.appendChild(label);
    await flushObserver();
    registerResolutionElement(label);

    const before = revisionsSnapshot();
    (label.firstChild as Text).data = "1";
    await flushObserver();

    expect(revisionsSnapshot().element).toBeGreaterThan(before.element);
  });

  it("counts child list changes under a registered element", async () => {
    const parent = document.createElement("div");
    document.body.appendChild(parent);
    await flushObserver();
    registerResolutionElement(parent);

    const before = revisionsSnapshot();
    parent.appendChild(document.createElement("span"));
    await flushObserver();

    expect(revisionsSnapshot().element).toBeGreaterThan(before.element);
  });

  it("counts content that changes deep inside the inspected element", async () => {
    const card = document.createElement("div");
    const wrapper = document.createElement("div");
    card.appendChild(wrapper);
    document.body.appendChild(card);
    await flushObserver();
    registerResolutionLineage(card);

    const before = revisionsSnapshot();
    wrapper.appendChild(document.createElement("span"));
    await flushObserver();

    expect(revisionsSnapshot().element).toBeGreaterThan(before.element);
  });

  it("re-resolves when a stylesheet arrives inside other content", async () => {
    const before = revisionsSnapshot();
    const wrapper = document.createElement("div");
    const style = document.createElement("style");
    style.textContent = ".a { color: red; }";
    wrapper.appendChild(style);
    document.body.appendChild(wrapper);
    await flushObserver();

    expect(revisionsSnapshot().element).toBeGreaterThan(before.element);
  });

  it("counts a change to an existing stylesheet's text", async () => {
    const style = document.createElement("style");
    style.textContent = ".a { color: red; }";
    document.head.appendChild(style);
    await flushObserver();

    const before = revisionsSnapshot();
    style.textContent = ".a { color: blue; }";
    await flushObserver();

    expect(revisionsSnapshot().stylesheet).toBeGreaterThan(before.stylesheet);
  });

  it("ignores the spacing cursor the renderer writes to registered elements", async () => {
    const el = document.createElement("div");
    document.body.appendChild(el);
    await flushObserver();
    registerResolutionElement(el);

    const before = revisionsSnapshot();
    el.style.setProperty("--nudge-ui-spacing-cursor", "ew-resize");
    el.style.removeProperty("--nudge-ui-spacing-cursor");
    await flushObserver();

    expect(revisionsSnapshot()).toEqual(before);
  });
});
