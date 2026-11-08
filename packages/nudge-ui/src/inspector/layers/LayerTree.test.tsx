// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { setSelectedElement } from "../selection/selectionStore.ts";
import { resolveSelectionFromElement } from "../selection/resolveSelection.ts";
import { LayerTree } from "./LayerTree.tsx";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("LayerTree", () => {
  let host: HTMLDivElement;
  let root: Root;
  let frame: HTMLIFrameElement;
  let page: Document;
  const scrollIntoView = vi.fn();

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    // The page lives in its own document, as a Canvas frame does, so the tree never lists its own rows.
    frame = document.createElement("iframe");
    document.body.appendChild(frame);
    page = frame.contentDocument!;
    page.body.innerHTML = `
      <section data-cid="Section" data-src="page.tsx:1:1">
        <button id="first" data-cid="First" data-src="page.tsx:2:1">First</button>
        <button id="second" data-cid="Second" data-src="page.tsx:3:1">Second</button>
      </section>`;
    scrollIntoView.mockClear();
    Element.prototype.scrollIntoView = scrollIntoView;
  });

  afterEach(() => {
    act(() => setSelectedElement(null));
    act(() => root.unmount());
    host.remove();
    frame.remove();
    delete (Element.prototype as Partial<Element>).scrollIntoView;
  });

  const select = (id: string): void => {
    act(() => setSelectedElement(resolveSelectionFromElement(page.getElementById(id)!)));
  };
  const render = (): void => {
    act(() => root.render(createElement(LayerTree, { doc: page })));
  };

  it("keeps its scroll position when it opens with an existing selection", () => {
    select("first");
    render();

    expect(host.querySelector('[data-test="layer-tree-item"][data-current="true"]')).not.toBeNull();
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it("scrolls to a new selection once, and not when a layer is opened or closed", () => {
    render();
    select("second");

    const current = host.querySelector('[data-test="layer-tree-item"][data-current="true"]');
    expect(current?.textContent).toContain("button#second");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.instances[0]).toBe(current);
    // An off-screen row lands mid-panel rather than at its bottom edge.
    expect(scrollIntoView).toHaveBeenCalledWith({ block: "center", inline: "nearest" });

    const expander = (): HTMLButtonElement => host.querySelector<HTMLButtonElement>('[data-test="layer-tree-expander"]')!;
    act(() => expander().click());
    act(() => expander().click());
    expect(expander().getAttribute("aria-expanded")).toBe("true");
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
  });
});
