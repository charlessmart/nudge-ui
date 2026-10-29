// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRendererSpacingView, gapBetween, gapPath, SPACING_LAYER_ID, spacingPaths } from "./rendererSpacing.ts";

const none = { top: 0, right: 0, bottom: 0, left: 0 };

describe("spacingPaths", () => {
  const rect = { left: 100, top: 50, right: 300, bottom: 150 };

  it("draws the margin ring outside the border edge and the padding ring inside the border", () => {
    const paths = spacingPaths(rect, {
      margin: { top: 8, right: 8, bottom: 8, left: 8 },
      padding: { top: 4, right: 4, bottom: 4, left: 4 },
      border: { top: 2, right: 2, bottom: 2, left: 2 },
    });
    expect(paths.margin).toBe("M92 42H308V158H92Z" + "M100 50H300V150H100Z");
    expect(paths.padding).toBe("M102 52H298V148H102Z" + "M106 56H294V144H106Z");
  });

  it("draws nothing for zero sides or negative margins", () => {
    expect(spacingPaths(rect, { margin: none, padding: none, border: none })).toEqual({ margin: "", padding: "" });
    const pulled = spacingPaths(rect, { margin: { top: -8, right: 0, bottom: 8, left: 0 }, padding: none, border: none });
    expect(pulled.margin).toBe("M100 50H300V158H100Z" + "M100 50H300V150H100Z");
  });
});

describe("gapBetween", () => {
  const first = { left: 0, top: 0, right: 100, bottom: 50 };

  it("spans the space between items side by side, across the height they share", () => {
    const second = { left: 120, top: 10, right: 200, bottom: 60 };
    expect(gapBetween(first, second, { column: 20, row: 0 })).toEqual({ left: 100, top: 10, right: 120, bottom: 50 });
  });

  it("spans the space between items stacked one above the other, across the width they share", () => {
    const below = { left: 0, top: 70, right: 100, bottom: 120 };
    expect(gapBetween(first, below, { column: 0, row: 20 })).toEqual({ left: 0, top: 50, right: 100, bottom: 70 });
  });

  it("finds the gap when the later item comes first, as in a reversed row", () => {
    const before = { left: 120, top: 0, right: 200, bottom: 50 };
    expect(gapBetween(before, first, { column: 20, row: 0 })).toEqual({ left: 100, top: 0, right: 120, bottom: 50 });
  });

  it("uses only the gap for its own axis, and none when the items do not line up", () => {
    const beside = { left: 120, top: 0, right: 200, bottom: 50 };
    expect(gapBetween(first, beside, { column: 0, row: 20 })).toBeNull();
    expect(gapBetween(first, { left: 120, top: 80, right: 200, bottom: 120 }, { column: 20, row: 20 })).toBeNull();
  });
});

describe("gapPath", () => {
  it("covers every gap between consecutive items, and nothing for a single item", () => {
    const items = [
      { left: 0, top: 0, right: 100, bottom: 50 },
      { left: 120, top: 0, right: 200, bottom: 50 },
      { left: 220, top: 0, right: 300, bottom: 50 },
    ];
    expect(gapPath(items, { column: 20, row: 0 })).toBe("M100 0H120V50H100Z" + "M200 0H220V50H200Z");
    expect(gapPath(items.slice(0, 1), { column: 20, row: 0 })).toBe("");
  });
});

describe("spacing view", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("draws an exploded subtree on one plane per depth that follows the root's transform", () => {
    document.body.innerHTML = `<section id="root" style="padding: 8px"><p id="child" style="margin: 4px">Text</p></section>`;
    const root = document.getElementById("root")!;
    const child = document.getElementById("child")!;
    vi.spyOn(root, "getBoundingClientRect").mockReturnValue(new DOMRect(100, 100, 200, 100));
    vi.spyOn(child, "getBoundingClientRect").mockReturnValue(new DOMRect(112, 112, 176, 20));

    const view = createRendererSpacingView(document);
    view.apply(true);
    view.explode({ root, layers: [{ element: root, depth: 0 }, { element: child, depth: 1 }] });

    const layer = document.getElementById(SPACING_LAYER_ID)!;
    const stage = layer.querySelector("div")!;
    expect(stage.style.width).toBe("200px");
    const planes = stage.querySelectorAll("svg");
    expect(planes).toHaveLength(2);
    // Paths sit relative to the root: its padding ring at depth 0, the child's margin ring at depth 1.
    expect(planes[0]!.querySelector("path")!.nextElementSibling!.getAttribute("d")).toBe("M0 0H200V100H0Z" + "M8 8H192V92H8Z");
    expect(planes[1]!.querySelector("path")!.getAttribute("d")).toBe("M8 8H192V36H8Z" + "M12 12H188V32H12Z");

    view.explode(null);
    expect(layer.querySelector("div")).toBeNull();
    view.dispose();
    expect(document.getElementById(SPACING_LAYER_ID)).toBeNull();
  });
});
