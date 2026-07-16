import { describe, expect, it } from "vitest";
import { nudgeCssValue } from "./nudgeValue.ts";

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
});
