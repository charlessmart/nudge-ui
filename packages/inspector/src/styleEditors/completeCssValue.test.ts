import { describe, expect, it } from "vitest";
import { completeCssValue } from "./completeCssValue.ts";
import { valuePolicyFor } from "./valuePolicy.ts";

describe("completeCssValue", () => {
  it.each([
    ["padding-top", "80", "80px"],
    ["row-gap", "12", "12px"],
    ["font-size", "1", "1rem"],
    ["line-height", "120", "120%"],
    ["line-height", "1.6", "160%"],
    ["letter-spacing", "0.04", "0.04em"],
    ["flex-basis", ".5", ".5px"],
    ["font-weight", "500", "500"],
    ["flex-grow", "2", "2"],
    ["color", "123456", "123456"],
  ])("completes %s value %s", (property, rawValue, expected) => {
    expect(completeCssValue(rawValue, valuePolicyFor(property))).toBe(expected);
  });

  it.each(["0", "-0", "4px", "50%", "auto", "normal", "var(--space-4)", "calc(100% - 1rem)", "1rem 2rem"])(
    "preserves valid explicit or compound CSS (%s)",
    (rawValue) => {
      expect(completeCssValue(rawValue, valuePolicyFor("padding-top"))).toBe(rawValue);
    },
  );

  it("trims surrounding whitespace before committing", () => {
    expect(completeCssValue("  1  ", valuePolicyFor("font-size"))).toBe("1rem");
  });

  it("preserves a zero line-height without adding a unit", () => {
    expect(completeCssValue("0", valuePolicyFor("line-height"))).toBe("0");
  });
});
