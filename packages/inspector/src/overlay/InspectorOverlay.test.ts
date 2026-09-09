import { describe, expect, it } from "vitest";
import { getMarginFills, getMarginGuides } from "./InspectorOverlay.tsx";

describe("getMarginGuides", () => {
  const rect = { left: 100, top: 200, width: 300, height: 120 };

  it("places guides at the outer edge of each non-zero margin", () => {
    expect(getMarginGuides(rect, { top: 16, right: 24, bottom: 8, left: 12 })).toEqual([
      { side: "top", axis: "horizontal", distance: 16, left: 100, top: 184, width: 300, height: 0 },
      { side: "right", axis: "vertical", distance: 24, left: 424, top: 200, width: 0, height: 120 },
      { side: "bottom", axis: "horizontal", distance: 8, left: 100, top: 328, width: 300, height: 0 },
      { side: "left", axis: "vertical", distance: 12, left: 88, top: 200, width: 0, height: 120 },
    ]);
  });

  it("does not render guides for zero margins", () => {
    expect(getMarginGuides(rect, { top: 0, right: 0, bottom: 0, left: 0 })).toEqual([]);
  });

  it("fills only the positive space between the box and each margin guide", () => {
    expect(getMarginFills(rect, { top: 16, right: 24, bottom: 8, left: -12 })).toEqual([
      { side: "top", left: 100, top: 184, width: 300, height: 16 },
      { side: "right", left: 400, top: 200, width: 24, height: 120 },
      { side: "bottom", left: 100, top: 320, width: 300, height: 8 },
    ]);
  });
});
