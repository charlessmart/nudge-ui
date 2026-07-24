import { describe, expect, it } from "vitest";
import { anchorEditPlan, axisAnchor, axisSide, positionAnchors } from "./positionAnchor.ts";

describe("positionAnchor", () => {
  it.each([
    [{ start: "12px", end: "auto" }, "start"],
    [{ start: "auto", end: "18px" }, "end"],
    [{ start: "10%", end: "20%" }, "stretch"],
    [{ start: "auto", end: "auto" }, "none"],
  ] as const)("infers %s as %s", (values, expected) => {
    expect(axisAnchor(values)).toBe(expected);
  });

  it("infers both axes independently", () => {
    expect(positionAnchors({
      horizontal: { start: "auto", end: "24px" },
      vertical: { start: "12px", end: "auto" },
    })).toEqual({ horizontal: "end", vertical: "start" });
  });

  it("moves a horizontal offset to the right and disables left", () => {
    expect(anchorEditPlan("horizontal", "end", { start: "32px", end: "auto" })).toEqual([
      { property: "left", value: "auto" },
      { property: "right", value: "32px" },
    ]);
  });

  it("keeps both offsets when selecting stretch", () => {
    expect(anchorEditPlan("vertical", "stretch", { start: "14px", end: "auto" })).toEqual([
      { property: "top", value: "14px" },
      { property: "bottom", value: "14px" },
    ]);
  });

  it("uses the physical side for an active axis", () => {
    expect(axisSide("horizontal", "start")).toBe("left");
    expect(axisSide("horizontal", "end")).toBe("right");
    expect(axisSide("vertical", "start")).toBe("top");
    expect(axisSide("vertical", "end")).toBe("bottom");
  });
});
