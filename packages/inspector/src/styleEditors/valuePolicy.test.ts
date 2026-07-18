import { describe, expect, it } from "vitest";
import { valuePolicyFor } from "./valuePolicy.ts";

describe("valuePolicyFor", () => {
  it.each([
    ["padding-top", "unit", "px"],
    ["border-top-width", "unit", "px"],
    ["row-gap", "unit", "px"],
    ["top", "unit", "px"],
    ["flex-basis", "unit", "px"],
    ["font-size", "unit", "rem"],
    ["line-height", "line-height", "%"],
    ["letter-spacing", "unit", "em"],
    ["font-weight", "number", null],
    ["flex-grow", "number", null],
    ["color", "raw", null],
    ["box-shadow", "raw", null],
  ] as const)("maps %s to its value policy", (property, kind, defaultUnit) => {
    expect(valuePolicyFor(property)).toMatchObject({ kind, defaultUnit });
  });

  it("keeps line-height's unitless multiplier available", () => {
    expect(valuePolicyFor("line-height").allowedUnits).toEqual(["%", "px", ""]);
  });

  it("limits letter spacing's assisted unit to em", () => {
    expect(valuePolicyFor("letter-spacing").allowedUnits).toEqual(["em"]);
  });
});
