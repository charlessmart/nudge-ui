import { describe, expect, it } from "vitest";
import type { ResolvedProperty } from "../../css/model/index.ts";
import type { SelectionProperty } from "../inspection/selectionProperty.ts";
import { deriveActiveTokenName, isExpressionRow } from "./fieldValue.ts";

function row(overrides: Partial<ResolvedProperty> = {}): ResolvedProperty {
  return {
    property: "color",
    declaredValue: "#000",
    resolvedValue: "#000",
    authored: "#000",
    ...overrides,
  } as ResolvedProperty;
}

function selection(
  value: SelectionProperty["value"],
  token: SelectionProperty["token"],
): SelectionProperty {
  return { property: "color", value, token, primaryRow: null, rows: [] };
}

describe("isExpressionRow", () => {
  it("treats raw, composite, alpha, and color expressions as expressions", () => {
    expect(isExpressionRow(row({ capability: "raw" }))).toBe(true);
    expect(isExpressionRow(row({ capability: "composite" }))).toBe(true);
    expect(isExpressionRow(row({ modifiers: [{ kind: "alpha" } as never] }))).toBe(true);
    expect(isExpressionRow(row({ color: { isExpression: true } as never }))).toBe(true);
  });

  it("leaves a plain token row alone", () => {
    expect(isExpressionRow(row())).toBe(false);
    expect(isExpressionRow(null)).toBe(false);
  });
});

describe("deriveActiveTokenName", () => {
  it("prefers a shared selection token", () => {
    expect(deriveActiveTokenName({
      row: row({ tokenName: "--row-token" }),
      selectedProperty: selection({ kind: "common", value: "red" }, { kind: "common", name: "--picked" }),
      mixed: false,
    })).toBe("--picked");
  });

  it("returns no token for a mixed or disagreeing selection", () => {
    expect(deriveActiveTokenName({
      row: row({ tokenName: "--row-token" }),
      selectedProperty: selection({ kind: "mixed" }, { kind: "mixed" }),
      mixed: true,
    })).toBeNull();
    expect(deriveActiveTokenName({
      row: row({ tokenName: "--row-token" }),
      selectedProperty: selection({ kind: "mixed" }, { kind: "none" }),
      mixed: false,
    })).toBeNull();
  });

  it("suppresses the chip for authored expressions and calc()", () => {
    expect(deriveActiveTokenName({ row: row({ capability: "raw" }), mixed: false })).toBeNull();
    expect(deriveActiveTokenName({
      row: row({ tokenName: "--space" }),
      mixed: false,
      authored: "calc(var(--space) * 2)",
    })).toBeNull();
  });

  it("falls back to the row token and honors an override", () => {
    expect(deriveActiveTokenName({ row: row({ tokenName: "--row-token" }), mixed: false }))
      .toBe("--row-token");
    expect(deriveActiveTokenName({
      row: row({ tokenName: "--row-token" }),
      mixed: false,
      override: "--opacity-token",
    })).toBe("--opacity-token");
  });
});
