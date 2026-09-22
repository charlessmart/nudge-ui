// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  getSpacingAffordanceAtPoint,
  spacingValueForDrag,
  toSpacingDescriptor,
} from "./spacingGestures.ts";

const originalElementFromPoint = document.elementFromPoint;

afterEach(() => {
  if (originalElementFromPoint) {
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint,
    });
  } else {
    delete (document as unknown as { elementFromPoint?: unknown }).elementFromPoint;
  }
  document.body.replaceChildren();
});

function rect(left: number, top: number, width: number, height: number): DOMRect {
  return { left, top, width, height, right: left + width, bottom: top + height } as DOMRect;
}

function trackedElement(tag = "div"): HTMLElement {
  const element = document.createElement(tag);
  element.dataset.cid = tag;
  element.dataset.src = `src/${tag}.tsx:1:1`;
  document.body.append(element);
  return element;
}

describe("spacing gestures", () => {
  it("finds a padding bar at the centre of the hovered side and maps drag direction", () => {
    const element = trackedElement();
    element.style.paddingTop = "20px";
    Object.defineProperty(element, "getBoundingClientRect", { value: () => rect(10, 10, 200, 120) });
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => element });

    const affordance = getSpacingAffordanceAtPoint(document, 100, 20);

    expect(affordance).toMatchObject({
      kind: "padding",
      property: "padding-top",
      side: "top",
      axis: "horizontal",
      value: 20,
      cursor: "ns-resize",
      guide: { left: 10, top: 19, width: 200, height: 2 },
      affectedAreas: [{ left: 10, top: 10, width: 200, height: 20 }],
    });
    expect(spacingValueForDrag(affordance!, { x: 100, y: 20 }, { x: 100, y: 28 })).toBe(28);
    expect(spacingValueForDrag(affordance!, { x: 100, y: 20 }, { x: 100, y: 0 })).toBe(0);
    expect(toSpacingDescriptor(affordance!)).toEqual({
      kind: "padding",
      property: "padding-top",
      side: "top",
    });
  });

  it("only exposes padding drag affordances within the centred guide handle", () => {
    const element = trackedElement();
    element.style.paddingTop = "48px";
    Object.defineProperty(element, "getBoundingClientRect", { value: () => rect(10, 10, 200, 120) });
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => element });

    // The pointer is still inside the top padding, but outside the centred
    // visible handle, so it is not a direct-manipulation target.
    expect(getSpacingAffordanceAtPoint(document, 100, 12)).toBeNull();
    expect(getSpacingAffordanceAtPoint(document, 20, 34)).toBeNull();
    expect(getSpacingAffordanceAtPoint(document, 100, 22)).toMatchObject({
      kind: "padding",
      property: "padding-top",
      hit: { left: 90, top: 22, width: 40, height: 24 },
    });
  });

  it("finds a column gap in a flex row and uses the gap property instead of padding", () => {
    const element = trackedElement();
    element.style.display = "flex";
    element.style.gap = "16px";
    const first = document.createElement("div");
    const second = document.createElement("div");
    const third = document.createElement("div");
    element.append(first, second, third);
    Object.defineProperty(element, "getBoundingClientRect", { value: () => rect(0, 0, 300, 100) });
    Object.defineProperty(first, "getBoundingClientRect", { value: () => rect(0, 0, 40, 100) });
    Object.defineProperty(second, "getBoundingClientRect", { value: () => rect(56, 0, 40, 100) });
    Object.defineProperty(third, "getBoundingClientRect", { value: () => rect(112, 0, 40, 100) });
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => element });

    const affordance = getSpacingAffordanceAtPoint(document, 48, 50);

    expect(affordance).toMatchObject({
      kind: "gap",
      property: "column-gap",
      side: null,
      axis: "horizontal",
      value: 16,
      cursor: "ew-resize",
      guide: { left: 47, top: 0, width: 2, height: 100 },
    });
    expect(affordance?.affectedGuides).toEqual([
      { left: 47, top: 0, width: 2, height: 100 },
      { left: 103, top: 0, width: 2, height: 100 },
    ]);
    expect(affordance?.affectedAreas).toEqual([
      { left: 40, top: 0, width: 16, height: 100 },
      { left: 96, top: 0, width: 16, height: 100 },
    ]);
    expect(spacingValueForDrag(affordance!, { x: 48, y: 50 }, { x: 60, y: 50 })).toBe(28);
    expect(spacingValueForDrag(affordance!, { x: 48, y: 50 }, { x: 0, y: 50 })).toBe(0);
  });

  it("only exposes gap drag affordances within the centred guide handle", () => {
    const element = trackedElement();
    element.style.display = "flex";
    element.style.columnGap = "48px";
    const first = document.createElement("div");
    const second = document.createElement("div");
    element.append(first, second);
    Object.defineProperty(element, "getBoundingClientRect", { value: () => rect(0, 0, 200, 100) });
    Object.defineProperty(first, "getBoundingClientRect", { value: () => rect(0, 0, 40, 100) });
    Object.defineProperty(second, "getBoundingClientRect", { value: () => rect(88, 0, 40, 100) });
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => element });

    // The 48px gap runs from x=40 through x=88. Its guide is centred at x=64.
    expect(getSpacingAffordanceAtPoint(document, 42, 50)).toBeNull();
    expect(getSpacingAffordanceAtPoint(document, 64, 8)).toBeNull();
    expect(getSpacingAffordanceAtPoint(document, 52, 50)).toMatchObject({
      kind: "gap",
      property: "column-gap",
      hit: { left: 52, top: 30, width: 24, height: 40 },
    });
  });

  it("keeps vertical gap drags on the row-gap axis", () => {
    const element = trackedElement();
    element.style.display = "grid";
    element.style.rowGap = "12px";
    const first = document.createElement("div");
    const second = document.createElement("div");
    const third = document.createElement("div");
    element.append(first, second, third);
    Object.defineProperty(element, "getBoundingClientRect", { value: () => rect(0, 0, 160, 200) });
    Object.defineProperty(first, "getBoundingClientRect", { value: () => rect(0, 0, 160, 40) });
    Object.defineProperty(second, "getBoundingClientRect", { value: () => rect(0, 52, 160, 40) });
    Object.defineProperty(third, "getBoundingClientRect", { value: () => rect(0, 104, 160, 40) });
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => element });

    const affordance = getSpacingAffordanceAtPoint(document, 80, 46);

    expect(affordance).toMatchObject({
      kind: "gap",
      property: "row-gap",
      axis: "vertical",
      cursor: "ns-resize",
      guide: { left: 0, top: 45, width: 160, height: 2 },
    });
    expect(affordance?.affectedGuides).toEqual([
      { left: 0, top: 45, width: 160, height: 2 },
      { left: 0, top: 97, width: 160, height: 2 },
    ]);
    expect(affordance?.affectedAreas).toEqual([
      { left: 0, top: 40, width: 160, height: 12 },
      { left: 0, top: 92, width: 160, height: 12 },
    ]);
    expect(spacingValueForDrag(affordance!, { x: 80, y: 46 }, { x: 80, y: 54 })).toBe(20);
  });

  it("uses screen-axis movement to increase every padding side", () => {
    const element = trackedElement();
    element.style.paddingRight = "20px";
    element.style.paddingBottom = "20px";
    Object.defineProperty(element, "getBoundingClientRect", { value: () => rect(10, 10, 200, 120) });
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => element });

    const bottom = getSpacingAffordanceAtPoint(document, 100, 120);
    expect(bottom?.property).toBe("padding-bottom");
    expect(spacingValueForDrag(bottom!, { x: 100, y: 120 }, { x: 100, y: 128 })).toBe(28);

    const right = getSpacingAffordanceAtPoint(document, 200, 70);
    expect(right?.property).toBe("padding-right");
    expect(spacingValueForDrag(right!, { x: 200, y: 70 }, { x: 208, y: 70 })).toBe(28);
  });
});
