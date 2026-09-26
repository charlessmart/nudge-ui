import { describe, expect, it } from "vitest";
import { nudgeCssValue, nudgeCssValueByDrag, nudgeOpacityValue, supportsDragNudge } from "./nudgeValue.ts";

describe("nudgeCssValue", () => {
  it.each([
    ["padding-top", "16px", 1, false, "17px"],
    ["padding-top", "16px", -1, true, "8px"],
    ["width", "50%", 1, true, "58%"],
    ["font-size", "1rem", 1, false, "1.125rem"],
    ["letter-spacing", "0.125em", -1, false, "0em"],
    ["flex-grow", "2", 1, true, "10"],
    ["font-weight", "400", 1, false, "500"],
    ["font-weight", "400", 1, true, "1000"],
    ["font-weight", "100", -1, true, "1"],
    ["line-height", "150%", 1, false, "160%"],
    ["line-height", "150%", -1, true, "70%"],
    ["line-height", "1.5", 1, false, "160%"],
    ["--line-height-body", "1.5", 1, false, "160%"],
    ["line-height", "0", -1, false, "0%"],
    ["line-height", "0", 1, false, "10%"],
    ["line-height", "24px", 1, true, "32px"],
    ["padding-top", "0.2px", 1, false, "1.2px"],
    ["padding-top", "0px", -1, false, "0px"],
    ["column-gap", "0px", -1, false, "0px"],
    ["border-radius", "4px", -1, true, "0px"],
  ] as const)("nudges %s value %s", (property, value, direction, large, expected) => {
    expect(nudgeCssValue(property, value, direction, large)).toBe(expected);
  });

  it.each([
    ["padding-top", "auto"],
    ["padding-top", "var(--space-2)"],
    ["padding-top", "calc(100% - 1rem)"],
    ["box-shadow", "0 1px 2px #000"],
    ["color", "#112233"],
    ["font-family", "Inter, sans-serif"],
  ])("leaves non-literal CSS alone: %s = %s", (property, value) => {
    expect(nudgeCssValue(property, value, 1)).toBeNull();
  });

  it("maps horizontal drag distance at reduced speed", () => {
    expect(nudgeCssValueByDrag("padding-top", "16px", 2)).toBeNull();
    expect(nudgeCssValueByDrag("padding-top", "16px", 4)).toBe("17px");
    expect(nudgeCssValueByDrag("border-radius", "16px", -2, true)).toBe("8px");
    expect(nudgeCssValueByDrag("margin-top", "1rem", 2, true)).toBe("2rem");
    expect(nudgeCssValueByDrag("padding-horizontal", "8px, 16px", 4)).toBe("9px, 17px");
  });

  it("snaps to the next large-step boundary when Shift starts mid-drag", () => {
    expect(nudgeCssValueByDrag("padding-top", "21px", 2, true, true)).toBe("24px");
    expect(nudgeCssValueByDrag("padding-top", "24px", 2, true)).toBe("32px");
    expect(nudgeCssValueByDrag("padding-top", "21px", -2, true, true)).toBe("16px");
  });

  it.each([
    "padding-top",
    "margin-left",
    "top",
    "inset-horizontal",
    "row-gap",
    "column-gap",
    "border-radius",
    "border-bottom-left-radius",
  ])("supports drag nudging for %s", (property) => {
    expect(supportsDragNudge(property)).toBe(true);
  });

  it.each(["width", "font-size", "box-shadow", "color"])("does not expose drag nudging for %s", (property) => {
    expect(supportsDragNudge(property)).toBe(false);
  });
});

describe("nudgeOpacityValue", () => {
  it.each([
    ["80%", 1, false, "81%"],
    ["80%", -1, true, "70%"],
    ["0%", -1, false, "0%"],
    ["95%", 1, true, "100%"],
  ] as const)("nudges %s", (value, direction, large, expected) => {
    expect(nudgeOpacityValue(value, direction, large)).toBe(expected);
  });

  it.each(["80", "var(--opacity)", "calc(50% + 1%)"])("rejects non-percentage opacity values: %s", (value) => {
    expect(nudgeOpacityValue(value, 1)).toBeNull();
  });
});
