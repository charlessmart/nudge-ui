import { describe, expect, it } from "vitest";
import {
  firstCssListItem,
  formatCssNumber,
  INITIAL_SIZE_VALUES,
  isCssNumber,
  parseCssNumber,
  SIZE_LIMIT_RESET_VALUES,
  splitCssList,
  splitCssTokens,
  stepCssNumber,
} from "./cssValue.ts";

describe("parseCssNumber", () => {
  it.each([
    ["12", 12, ""],
    ["12px", 12, "px"],
    ["-0.5rem", -0.5, "rem"],
    ["+3px", 3, "px"],
    ["1e3px", 1000, "px"],
    ["50%", 50, "%"],
    ["2vmin", 2, "vmin"],
  ])("reads %s as %d%s", (text, number, unit) => {
    expect(parseCssNumber(text)).toEqual({ number, unit });
  });

  it.each(["auto", "calc(1px + 2px)", "1px 2px", "var(--x)", ""])("rejects %s", (text) => {
    expect(parseCssNumber(text)).toBeNull();
  });

  it("tells a bare number apart from a length", () => {
    expect([isCssNumber("12"), isCssNumber("12px")]).toEqual([true, false]);
  });
});

describe("formatCssNumber", () => {
  it("trims float noise and normalises negative zero", () => {
    expect([formatCssNumber(-0), formatCssNumber(0.1 + 0.2), formatCssNumber(1.6000000000000003)])
      .toEqual(["0", "0.3", "1.6"]);
  });
});

describe("stepCssNumber", () => {
  it("keeps the unit while stepping", () => {
    expect([stepCssNumber("1.5rem", 0.125), stepCssNumber("50%", -1), stepCssNumber("12", 1)])
      .toEqual(["1.625rem", "49%", "13"]);
  });

  it("refuses a value it cannot read", () => {
    expect(stepCssNumber("calc(1px + 2px)", 1)).toBeNull();
  });
});

describe("splitCssList", () => {
  it("ignores commas inside functions and quotes", () => {
    expect(splitCssList("calc(1px + 2px), 3px")).toEqual(["calc(1px + 2px)", "3px"]);
    expect(splitCssList('"A, B", sans-serif')).toEqual(['"A, B"', "sans-serif"]);
    expect(splitCssList("var(--x, 1px), 2px")).toEqual(["var(--x, 1px)", "2px"]);
  });

  it("returns one empty part for an empty value", () => {
    expect(splitCssList("")).toEqual([""]);
  });
});

describe("splitCssTokens", () => {
  it("splits a track list on top-level whitespace", () => {
    expect(splitCssTokens("repeat(2, minmax(0, 1fr)) 1fr auto")).toEqual(["repeat(2, minmax(0, 1fr))", "1fr", "auto"]);
  });

  it("keeps quoted whitespace inside one token", () => {
    expect(splitCssTokens('"a b" 1fr')).toEqual(['"a b"', "1fr"]);
  });
});

describe("firstCssListItem", () => {
  it("takes the first family of a font list", () => {
    expect(firstCssListItem('Inter, "Helvetica Neue", sans-serif')).toBe("Inter");
    expect(firstCssListItem("var(--font, Inter, sans-serif), serif")).toBe("var(--font, Inter, sans-serif)");
    expect(firstCssListItem("Inter")).toBe("Inter");
  });
});

describe("size defaults", () => {
  it("shows a computed initial value but writes the specified one when removing a limit", () => {
    expect(INITIAL_SIZE_VALUES["min-width"]).toBe("0");
    expect(SIZE_LIMIT_RESET_VALUES["min-width"]).toBe("auto");
    expect(SIZE_LIMIT_RESET_VALUES["max-width"]).toBe(INITIAL_SIZE_VALUES["max-width"]);
  });
});
