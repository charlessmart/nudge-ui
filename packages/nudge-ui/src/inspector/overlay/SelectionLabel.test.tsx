// @vitest-environment jsdom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { SelectionLabel, selectionLabelPosition } from "./SelectionLabel.tsx";

const bounds = { left: 0, top: 0, width: 800, height: 600 };

describe("selectionLabelPosition", () => {
  it("centers the label 8px below the selection", () => {
    expect(selectionLabelPosition({ left: 100, top: 100, width: 200, height: 50 }, { width: 80, height: 24 }, bounds))
      .toEqual({ left: 160, top: 158 });
  });

  it("keeps the label inside the visible frame", () => {
    expect(selectionLabelPosition({ left: 760, top: 560, width: 40, height: 40 }, { width: 80, height: 24 }, bounds))
      .toEqual({ left: 716, top: 572 });
  });
});

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement | null = null;
let root: Root | null = null;

function render(element: ReactElement): HTMLDivElement {
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  act(() => root!.render(element));
  return host;
}

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  host?.remove();
  host = null;
});

describe("SelectionLabel", () => {
  it("names the tag and the rounded size", () => {
    const element = document.createElement("section");
    const container = render(createElement(SelectionLabel, { element, anchor: { left: 10, top: 10, width: 100, height: 40 }, size: { width: 99.6, height: 40.2 }, bounds, linked: true }));
    const label = container.querySelector<HTMLElement>("[data-test='selection-label']")!;
    expect(label.dataset.linked).toBe("true");
    expect(label.textContent).toBe("section100 × 40");
  });

  it("hides once the selection has scrolled out of the frame", () => {
    const container = render(createElement(SelectionLabel, { element: document.createElement("div"), anchor: { left: 10, top: 700, width: 100, height: 40 }, size: { width: 100, height: 40 }, bounds }));
    expect(container.innerHTML).toBe("");
  });
});
