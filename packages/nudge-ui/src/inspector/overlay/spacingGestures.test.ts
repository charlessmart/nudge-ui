// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  getElementSpacingAtPoint,
  getElementSpacingHandleAtPoint,
  getSpacingAffordanceAtPoint,
  getSpacingAffordanceForDescriptor,
  getSpacingHoverAtPoint,
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

    // Inside the top padding but outside the centred visible handle, so not a direct-manipulation target.
    expect(getSpacingAffordanceAtPoint(document, 100, 12)).toBeNull();
    expect(getSpacingAffordanceAtPoint(document, 20, 34)).toBeNull();
    expect(getSpacingAffordanceAtPoint(document, 100, 24)).toBeNull();
    expect(getSpacingAffordanceAtPoint(document, 100, 30)).toMatchObject({
      kind: "padding",
      property: "padding-top",
      hit: { left: 90, top: 26, width: 40, height: 16 },
    });

    // The same points light up the hover overlay: hover previews match the whole padding bar.
    expect(getSpacingHoverAtPoint(document, 100, 12)).toMatchObject({
      kind: "padding",
      property: "padding-top",
      side: "top",
      value: 48,
    });
    expect(getSpacingHoverAtPoint(document, 20, 34)).toMatchObject({ kind: "padding", property: "padding-top" });
    expect(getSpacingHoverAtPoint(document, 100, 24)).toMatchObject({ kind: "padding", property: "padding-top" });
    expect(getSpacingHoverAtPoint(document, 100, 60)).toBeNull();
  });

  it("does not expose zero-sized padding as a drag affordance", () => {
    const element = trackedElement();
    element.style.padding = "0";
    Object.defineProperty(element, "getBoundingClientRect", { value: () => rect(10, 10, 200, 120) });
    Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => element });

    expect(getSpacingAffordanceAtPoint(document, 100, 10)).toBeNull();
    expect(getSpacingAffordanceAtPoint(document, 10, 70)).toBeNull();
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
    expect(getSpacingAffordanceAtPoint(document, 52, 50)).toBeNull();
    expect(getSpacingAffordanceAtPoint(document, 60, 50)).toMatchObject({
      kind: "gap",
      property: "column-gap",
      hit: { left: 56, top: 30, width: 16, height: 40 },
    });

    // Anywhere inside the gap is a hover preview target, but not a drag one.
    expect(getSpacingHoverAtPoint(document, 42, 50)).toMatchObject({
      kind: "gap",
      property: "column-gap",
      value: 48,
    });
    expect(getSpacingHoverAtPoint(document, 64, 8)).toMatchObject({ kind: "gap", property: "column-gap" });
    expect(getSpacingHoverAtPoint(document, 52, 50)).toMatchObject({ kind: "gap", property: "column-gap" });
    expect(getSpacingHoverAtPoint(document, 60, 50)).toMatchObject({ kind: "gap", property: "column-gap" });
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

  it("grows top and bottom padding by dragging down and right padding by dragging left", () => {
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
    expect(spacingValueForDrag(right!, { x: 200, y: 70 }, { x: 192, y: 70 })).toBe(28);
    expect(spacingValueForDrag(right!, { x: 200, y: 70 }, { x: 208, y: 70 })).toBe(12);
  });

  it("moves spacing in 8px steps anchored on the nearest step while Shift is held", () => {
    const affordance = { dragAxis: "y" as const, direction: 1 as const, value: 20 };

    // The first displacement snaps to the nearest multiple of 8 in the drag direction.
    expect(spacingValueForDrag(affordance, { x: 100, y: 20 }, { x: 100, y: 21 }, true)).toBe(24);
    expect(spacingValueForDrag(affordance, { x: 100, y: 20 }, { x: 100, y: 27 }, true)).toBe(24);
    expect(spacingValueForDrag(affordance, { x: 100, y: 20 }, { x: 100, y: 19 }, true)).toBe(16);
    expect(spacingValueForDrag(affordance, { x: 100, y: 20 }, { x: 100, y: 12 }, true)).toBe(8);
    // Larger displacements step by whole 8px from the snapped anchor.
    expect(spacingValueForDrag(affordance, { x: 100, y: 20 }, { x: 100, y: 28 }, true)).toBe(32);
    expect(spacingValueForDrag(affordance, { x: 100, y: 20 }, { x: 100, y: 44 }, true)).toBe(48);
    // The exact start point keeps the authored value and a later snap re-anchors.
    expect(spacingValueForDrag(affordance, { x: 100, y: 20 }, { x: 100, y: 20 }, true)).toBe(20);
    // An already-multiples value anchors on itself.
    expect(spacingValueForDrag(affordance, { x: 100, y: 20 }, { x: 100, y: 30 }, true)).toBe(32);
    expect(spacingValueForDrag(affordance, { x: 100, y: 20 }, { x: 100, y: 22 }, true)).toBe(24);
  });

  it("scopes affordances to one element exactly like filtering the document-wide search", () => {
    const outer = trackedElement();
    outer.style.padding = "24px";
    const row = document.createElement("div");
    row.dataset.cid = "row";
    row.style.display = "flex";
    row.style.gap = "16px";
    row.style.padding = "8px";
    const first = document.createElement("div");
    first.dataset.cid = "first";
    const second = document.createElement("div");
    second.dataset.cid = "second";
    second.style.padding = "12px";
    second.style.display = "grid";
    second.style.rowGap = "10px";
    const top = document.createElement("div");
    top.dataset.cid = "top";
    const bottom = document.createElement("div");
    bottom.dataset.cid = "bottom";
    second.append(top, bottom);
    row.append(first, second);
    outer.append(row);
    const boxes = new Map<HTMLElement, DOMRect>([
      [outer, rect(0, 0, 400, 300)],
      [row, rect(24, 24, 352, 252)],
      [first, rect(32, 32, 100, 236)],
      [second, rect(148, 32, 200, 236)],
      [top, rect(160, 44, 176, 100)],
      [bottom, rect(160, 154, 176, 102)],
    ]);
    for (const [element, box] of boxes) Object.defineProperty(element, "getBoundingClientRect", { value: () => box });
    const deepestFirst = [top, bottom, first, second, row, outer];
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: (x: number, y: number) => deepestFirst.find((element) => {
        const box = boxes.get(element)!;
        return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
      }) ?? null,
    });

    let matches = 0;
    for (let x = 0; x <= 400; x += 8) {
      for (let y = 0; y <= 300; y += 8) {
        const handle = getSpacingAffordanceAtPoint(document, x, y);
        const area = getSpacingHoverAtPoint(document, x, y);
        for (const element of deepestFirst) {
          const scoped = getElementSpacingAtPoint(document, element, x, y);
          expect(scoped.handle).toEqual(handle?.element === element ? handle : null);
          expect(scoped.area).toEqual(area?.element === element ? area : null);
          expect(getElementSpacingHandleAtPoint(document, element, x, y)).toEqual(scoped.handle);
          if (scoped.handle || scoped.area) matches++;
        }
      }
    }
    expect(matches).toBeGreaterThan(20);
  });

  describe("margins", () => {
    function parentWithChild(childMargin: string): { parent: HTMLElement; child: HTMLElement } {
      const parent = trackedElement();
      const child = document.createElement("div");
      child.dataset.cid = "child";
      child.dataset.src = "src/child.tsx:1:1";
      child.style.margin = childMargin;
      parent.append(child);
      const boxes = new Map<HTMLElement, DOMRect>([
        [parent, rect(0, 0, 400, 300)],
        [child, rect(100, 80, 200, 100)],
      ]);
      for (const [element, box] of boxes) Object.defineProperty(element, "getBoundingClientRect", { value: () => box });
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: (x: number, y: number) => [child, parent].find((element) => {
          const box = boxes.get(element)!;
          return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
        }) ?? null,
      });
      return { parent, child };
    }

    it("finds a child's margin handle in the band outside its border box and grows it by dragging down", () => {
      const { child } = parentWithChild("40px 0 0 0");

      const affordance = getSpacingAffordanceAtPoint(document, 200, 60);

      expect(affordance).toMatchObject({
        kind: "margin",
        property: "margin-top",
        side: "top",
        axis: "horizontal",
        value: 40,
        cursor: "ns-resize",
        guide: { left: 100, top: 59, width: 200, height: 2 },
        affectedAreas: [{ left: 100, top: 40, width: 200, height: 40 }],
      });
      expect(affordance?.element).toBe(child);
      expect(spacingValueForDrag(affordance!, { x: 200, y: 60 }, { x: 200, y: 68 })).toBe(48);
      expect(spacingValueForDrag(affordance!, { x: 200, y: 60 }, { x: 200, y: 40 })).toBe(20);
      expect(toSpacingDescriptor(affordance!)).toEqual({ kind: "margin", property: "margin-top", side: "top" });
    });

    it("grows the left margin by dragging right and the right margin by dragging left", () => {
      parentWithChild("0 30px 0 50px");

      const left = getSpacingAffordanceAtPoint(document, 75, 130);
      const right = getSpacingAffordanceAtPoint(document, 315, 130);

      expect(left).toMatchObject({ property: "margin-left", direction: 1, value: 50 });
      expect(right).toMatchObject({ property: "margin-right", direction: -1, value: 30 });
      expect(spacingValueForDrag(left!, { x: 75, y: 130 }, { x: 85, y: 130 })).toBe(60);
      expect(spacingValueForDrag(right!, { x: 315, y: 130 }, { x: 305, y: 130 })).toBe(40);
    });

    it("previews the whole margin band on hover and not outside it", () => {
      parentWithChild("40px 0 0 0");

      expect(getSpacingHoverAtPoint(document, 120, 45)).toMatchObject({ kind: "margin", property: "margin-top" });
      expect(getSpacingHoverAtPoint(document, 120, 20)).toBeNull();
    });

    it("scopes a margin to the hovered parent and reports the child as its owner", () => {
      const { parent, child } = parentWithChild("40px 0 0 0");

      const scoped = getElementSpacingAtPoint(document, parent, 200, 60);

      expect(scoped.handle?.element).toBe(child);
      expect(scoped.area?.element).toBe(child);
      expect(getElementSpacingAtPoint(document, child, 200, 60).handle).toBeNull();
    });

    it("resolves a descriptor back to the margin affordance of its element", () => {
      const { child } = parentWithChild("0 0 24px 0");

      expect(getSpacingAffordanceForDescriptor(child, { kind: "margin", property: "margin-bottom", side: "bottom" }))
        .toMatchObject({ value: 24, guide: { top: 191, left: 100, width: 200, height: 2 } });
      expect(getSpacingAffordanceForDescriptor(child, { kind: "margin", property: "margin-top", side: "top" })).toBeNull();
    });

    it("does not expose zero margins", () => {
      parentWithChild("0");

      expect(getSpacingAffordanceAtPoint(document, 200, 79)).toBeNull();
    });
  });
});
