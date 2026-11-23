// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  getResizeHandleAtPoint,
  isResizable,
  planResize,
  renderedResizeValues,
  resizeCommitDeclarations,
  resizePreviewDeclarations,
  resizePreviewProperties,
  resizeValuesForDrag,
  visibleResizeHandles,
} from "./resizeGestures.ts";

afterEach(() => {
  document.body.replaceChildren();
});

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top } as DOMRect;
}

function box(style: Partial<CSSStyleDeclaration> = {}, parent: HTMLElement = document.body, tag = "div"): HTMLElement {
  const element = document.createElement(tag);
  Object.assign(element.style, { display: "block", boxSizing: "border-box", ...style });
  parent.append(element);
  return element;
}

function sized(element: HTMLElement, geometry: () => DOMRect): HTMLElement {
  Object.defineProperty(element, "getBoundingClientRect", { configurable: true, value: geometry });
  return element;
}

describe("resize handles", () => {
  // 8px handles: the hit square reaches 6px out from the handle's centre, and at most a quarter of the box inward.
  const SIZE = 8;
  const element = (): HTMLElement => sized(box(), () => rect(100, 100, 200, 100));

  it("finds the right, bottom and bottom-right handles, the corner first", () => {
    const target = element();
    expect(getResizeHandleAtPoint(target, 300, 150, SIZE)).toBe("right");
    expect(getResizeHandleAtPoint(target, 305, 154, SIZE)).toBe("right");
    expect(getResizeHandleAtPoint(target, 200, 202, SIZE)).toBe("bottom");
    expect(getResizeHandleAtPoint(target, 302, 202, SIZE)).toBe("bottom-right");
    expect(getResizeHandleAtPoint(target, 297, 197, SIZE)).toBe("bottom-right");
  });

  it("hits only the drawn handles, leaving the left and top edges and the rest of the outline to clicks", () => {
    const target = element();
    // Left and top resizes would move the opposite edge, so they have no handle.
    expect(getResizeHandleAtPoint(target, 100, 150, SIZE)).toBeNull();
    expect(getResizeHandleAtPoint(target, 200, 100, SIZE)).toBeNull();
    expect(getResizeHandleAtPoint(target, 100, 100, SIZE)).toBeNull();
    // Along the right and bottom edges away from their handles, a neighbour or child still gets the click.
    expect(getResizeHandleAtPoint(target, 301, 110, SIZE)).toBeNull();
    expect(getResizeHandleAtPoint(target, 240, 201, SIZE)).toBeNull();
  });

  it("drops edge handles too short to clear the corner, and keeps a small element's centre free", () => {
    expect(visibleResizeHandles({ left: 0, top: 0, width: 200, height: 20 }, SIZE)).toEqual(["bottom-right", "bottom"]);
    const target = sized(box(), () => rect(0, 0, 8, 8));
    expect(getResizeHandleAtPoint(target, 4, 4, SIZE)).toBeNull();
    expect(getResizeHandleAtPoint(target, 9, 9, SIZE)).toBe("bottom-right");
    expect(getResizeHandleAtPoint(target, 9, 7, SIZE)).toBe("bottom-right");
  });

  it("offers no handles where width and height do not apply, nor on the page target and root", () => {
    const inline = sized(box({ display: "inline" }, document.body, "span"), () => rect(0, 0, 50, 20));
    expect(isResizable(inline)).toBe(false);
    expect(getResizeHandleAtPoint(inline, 50, 20, SIZE)).toBeNull();
    const image = sized(box({ display: "inline" }, document.body, "img"), () => rect(0, 0, 50, 20));
    expect(isResizable(image)).toBe(true);
    // The page target and the root fill the frame, so handles there would sit on its own edges.
    expect(isResizable(document.body)).toBe(false);
    expect(isResizable(document.documentElement)).toBe(false);
  });
});

describe("resize values", () => {
  it("starts an auto-sized element from its rendered px and drags only the handle's axis", () => {
    const target = sized(box({ width: "auto" }), () => rect(0, 0, 240, 80));
    const plan = planResize(target, "right");
    expect(plan.height).toBeNull();
    expect(resizeValuesForDrag(plan, { x: 240, y: 40 }, { x: 240, y: 40 })).toEqual({ width: 240, height: null });
    expect(resizeValuesForDrag(plan, { x: 240, y: 40 }, { x: 270, y: 90 })).toEqual({ width: 270, height: null });
    expect(resizePreviewDeclarations(plan, { width: 270, height: null })).toEqual([{ property: "width", value: "270px" }]);
  });

  it("keeps the dragged edge under the pointer while the top-left corner stays put", () => {
    // Normal flow keeps the box's left and top where they are; the written size moves only the right and bottom.
    let size = { width: 200, height: 100 };
    const target = sized(box(), () => rect(40, 30, size.width, size.height));
    const plan = planResize(target, "bottom-right");
    const start = { x: 240, y: 130 };
    const pointer = { x: 275, y: 112 };
    const next = resizeValuesForDrag(plan, start, pointer);
    size = { width: next.width!, height: next.height! };
    const after = target.getBoundingClientRect();
    expect([after.left, after.top]).toEqual([40, 30]);
    expect([after.right, after.bottom]).toEqual([pointer.x, pointer.y]);
    expect(resizeValuesForDrag(plan, start, { x: -500, y: -500 })).toEqual({ width: 0, height: 0 });
  });

  it("writes content-box values that keep the border box under the pointer", () => {
    const target = sized(
      box({ boxSizing: "content-box", paddingLeft: "10px", paddingRight: "10px", borderLeftWidth: "1px", borderRightWidth: "1px", borderStyle: "solid" }),
      () => rect(0, 0, 222, 50),
    );
    const plan = planResize(target, "right");
    expect(plan.width?.startValue).toBe(200);
    expect(resizeValuesForDrag(plan, { x: 222, y: 0 }, { x: 252, y: 0 })).toEqual({ width: 230, height: null });
  });

  it("works in the element's own px under a scaled ancestor", () => {
    // A preview scaled up 2x: laid out 300px wide, painted 600px wide on screen.
    const target = sized(box(), () => rect(0, 0, 600, 100));
    Object.defineProperty(target, "offsetWidth", { configurable: true, value: 300 });
    Object.defineProperty(target, "offsetHeight", { configurable: true, value: 50 });
    const plan = planResize(target, "bottom-right");
    expect(plan.width?.startValue).toBe(300);
    expect(resizeValuesForDrag(plan, { x: 600, y: 100 }, { x: 600, y: 100 })).toEqual({ width: 300, height: 50 });
    expect(resizeValuesForDrag(plan, { x: 600, y: 100 }, { x: 640, y: 120 })).toEqual({ width: 320, height: 60 });
    sized(target, () => rect(0, 0, 640, 120));
    expect(renderedResizeValues(plan, { width: 320, height: 60 })).toEqual({ width: 320, height: 60 });
  });

  it("snaps the visible size to 8px with Shift", () => {
    const target = sized(box(), () => rect(0, 0, 203, 50));
    const plan = planResize(target, "right");
    expect(resizeValuesForDrag(plan, { x: 203, y: 0 }, { x: 210, y: 0 }, true)).toEqual({ width: 208, height: null });
  });

  it("fixes a filling flex item along the main axis only", () => {
    const row = box({ display: "flex", flexDirection: "row" });
    const item = sized(box({ flexGrow: "1", flexShrink: "1", flexBasis: "0%" }, row), () => rect(0, 0, 300, 40));
    const widthPlan = planResize(item, "right");
    expect(resizePreviewProperties(widthPlan)).toEqual(["width", "flex-grow", "flex-shrink", "flex-basis"]);
    expect(resizeCommitDeclarations(widthPlan, { width: 320, height: null })).toEqual([
      { property: "width", value: "320px", oldRawValue: "300px" },
      { property: "flex-grow", value: "0", oldRawValue: "1" },
      { property: "flex-shrink", value: "0", oldRawValue: "1" },
      { property: "flex-basis", value: "auto", oldRawValue: "0%" },
    ]);
    expect(resizePreviewProperties(planResize(item, "bottom"))).toEqual(["height"]);
  });

  it("only stops a non-growing flex item shrinking, so a full row cannot give the width back", () => {
    const row = box({ display: "flex", flexDirection: "row" });
    const item = sized(box({ flexGrow: "0", flexShrink: "1", flexBasis: "auto" }, row), () => rect(0, 0, 120, 40));
    expect(resizeCommitDeclarations(planResize(item, "right"), { width: 160, height: null })).toEqual([
      { property: "width", value: "160px", oldRawValue: "120px" },
      { property: "flex-shrink", value: "0", oldRawValue: "1" },
    ]);
  });

  it("commits nothing for an axis that ends where it started", () => {
    const target = sized(box(), () => rect(0, 0, 200, 100));
    const plan = planResize(target, "bottom-right");
    expect(resizeCommitDeclarations(plan, { width: 200, height: 100 })).toEqual([]);
    expect(resizeCommitDeclarations(plan, { width: 200, height: 140 })).toEqual([
      { property: "height", value: "140px", oldRawValue: "100px" },
    ]);
  });
});
