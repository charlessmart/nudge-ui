// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { clearDropGuide, showDropGuide, useDropGuide } from "./dropGuide.ts";
import { DropGuideOverlay } from "./DropGuideOverlay.tsx";
import type { DropLocation } from "./structuralGestures.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(() => {
  act(() => clearDropGuide("canvas"));
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

function CanvasGuide() {
  return createElement(DropGuideOverlay, {
    guide: useDropGuide("canvas"),
    lineClassName: "line",
    lineTestId: "line",
    slotClassName: "slot",
    slotTestId: "slot",
  });
}

function render(): HTMLElement {
  const container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  act(() => root!.render(createElement(CanvasGuide)));
  return container;
}

function drop(): DropLocation {
  const parent = document.createElement("div");
  document.body.append(parent);
  return { parent, before: null, orientation: "vertical", left: 40, top: 0, width: 4, height: 120 };
}

describe("drop guide", () => {
  it("shows the reflowed slot in place of the insertion line", () => {
    const container = render();
    act(() => showDropGuide("canvas", document, drop(), { left: 40, top: 0, width: 80, height: 120 } as DOMRect));
    expect(container.querySelector('[data-test="slot"]')).not.toBeNull();
    expect(container.querySelector('[data-test="line"]')).toBeNull();
  });

  it("falls back to the line when the slot has no box, as for an empty element", () => {
    const container = render();
    act(() => showDropGuide("canvas", document, drop(), { left: 40, top: 0, width: 0, height: 0 } as DOMRect));
    const line = container.querySelector<HTMLElement>('[data-test="line"]');
    expect(container.querySelector('[data-test="slot"]')).toBeNull();
    expect(line?.dataset.orientation).toBe("vertical");
    expect([line?.style.left, line?.style.width]).toEqual(["40px", "4px"]);
  });
});
