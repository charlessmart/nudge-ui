// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  getSpacingAffordanceAtPoint,
  spacingValueForDrag,
  toSpacingGuideData,
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
    });
    expect(spacingValueForDrag(affordance!, { x: 100, y: 20 }, { x: 100, y: 28 })).toBe(28);
    expect(spacingValueForDrag(affordance!, { x: 100, y: 20 }, { x: 100, y: 0 })).toBe(0);
    expect(toSpacingGuideData(affordance!)).not.toHaveProperty("element");
  });

  it("finds a column gap in a flex row and uses the gap property instead of padding", () => {
    const element = trackedElement();
    element.style.display = "flex";
    element.style.gap = "16px";
    const first = document.createElement("div");
    const second = document.createElement("div");
    element.append(first, second);
    Object.defineProperty(element, "getBoundingClientRect", { value: () => rect(0, 0, 300, 100) });
    Object.defineProperty(first, "getBoundingClientRect", { value: () => rect(0, 0, 40, 100) });
    Object.defineProperty(second, "getBoundingClientRect", { value: () => rect(56, 0, 40, 100) });
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
    expect(spacingValueForDrag(affordance!, { x: 48, y: 50 }, { x: 60, y: 50 })).toBe(28);
    expect(spacingValueForDrag(affordance!, { x: 48, y: 50 }, { x: 0, y: 50 })).toBe(0);
  });

  it("keeps vertical gap drags on the row-gap axis", () => {
    const element = trackedElement();
    element.style.display = "grid";
    element.style.rowGap = "12px";
    const first = document.createElement("div");
    const second = document.createElement("div");
    element.append(first, second);
    Object.defineProperty(element, "getBoundingClientRect", { value: () => rect(0, 0, 160, 200) });
    Object.defineProperty(first, "getBoundingClientRect", { value: () => rect(0, 0, 160, 40) });
    Object.defineProperty(second, "getBoundingClientRect", { value: () => rect(0, 52, 160, 40) });
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => element });

    const affordance = getSpacingAffordanceAtPoint(document, 80, 46);

    expect(affordance).toMatchObject({
      kind: "gap",
      property: "row-gap",
      axis: "vertical",
      cursor: "ns-resize",
      guide: { left: 0, top: 45, width: 160, height: 2 },
    });
  });
});
