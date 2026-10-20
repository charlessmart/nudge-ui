import { describe, expect, it } from "vitest";
import { isCalcExpression, parseSingleVarReference } from "./cssSyntax.ts";

describe("parseSingleVarReference", () => {
  it("parses a bare reference", () => {
    expect(parseSingleVarReference("var(--space-4)")).toEqual({ name: "--space-4" });
    expect(parseSingleVarReference("  VAR( --color )  ")).toEqual({ name: "--color" });
  });

  it("keeps the fallback", () => {
    expect(parseSingleVarReference("var(--color, #fff)")).toEqual({
      name: "--color",
      fallback: "#fff",
    });
  });

  it("accepts nested parentheses in the fallback", () => {
    expect(parseSingleVarReference("var(--space, calc(1px + 2px))")).toEqual({
      name: "--space",
      fallback: "calc(1px + 2px)",
    });
  });

  it("rejects trailing text that the old regex swallowed", () => {
    expect(parseSingleVarReference("var(--color, red) extra")).toBeNull();
  });

  it("rejects multiple or embedded references", () => {
    expect(parseSingleVarReference("var(--a) var(--b)")).toBeNull();
    expect(parseSingleVarReference("1px solid var(--border)")).toBeNull();
    expect(parseSingleVarReference("calc(var(--space) * 2)")).toBeNull();
  });

  it("rejects malformed names and unterminated calls", () => {
    expect(parseSingleVarReference("var(color)")).toBeNull();
    expect(parseSingleVarReference("var(--color")).toBeNull();
  });
});

describe("isCalcExpression", () => {
  it("detects calc anywhere in a value", () => {
    expect(isCalcExpression("calc(100% - 1rem)")).toBe(true);
    expect(isCalcExpression("CALC( 1px )")).toBe(true);
    expect(isCalcExpression("12px")).toBe(false);
    expect(isCalcExpression("recalc(1px)")).toBe(false);
  });
});
