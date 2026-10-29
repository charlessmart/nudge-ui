import { describe, expect, it } from "vitest";
import type { ResolvedProperty } from "../../css/model/index.ts";
import { intersectTokenEntries, projectSelectionProperty } from "./selectionProperty.ts";

function property(value: string, tokenName: string | null = null): ResolvedProperty {
  return {
    property: "font-size",
    tokenName,
    declaredValue: tokenName ? `var(${tokenName})` : value,
    resolvedValue: value,
    authored: tokenName ? `var(${tokenName})` : value,
    confidence: "exact",
    evidence: { reason: "test" },
  };
}

describe("projectSelectionProperty", () => {
  it("reports one common value and token without changing the authored row", () => {
    const primary = property("24px", "--type-heading");
    const result = projectSelectionProperty(
      "font-size",
      [property("24px", "--type-heading"), primary],
      ["24px", "24px"],
      1,
    );

    expect(result).toMatchObject({
      property: "font-size",
      value: { kind: "common", value: "24px" },
      token: { kind: "common", name: "--type-heading" },
      primaryRow: primary,
    });
  });

  it("represents mixed values independently from common token provenance", () => {
    const result = projectSelectionProperty(
      "font-size",
      [property("24px", "--type-heading"), property("20px", "--type-heading")],
      ["24px", "20px"],
      0,
    );

    expect(result?.value).toEqual({ kind: "mixed" });
    expect(result?.token).toEqual({ kind: "common", name: "--type-heading" });
  });

  it("represents mixed token provenance independently from a common value", () => {
    const result = projectSelectionProperty(
      "font-size",
      [property("24px", "--type-heading"), property("24px", "--type-body")],
      ["24px", "24px"],
      0,
    );

    expect(result?.value).toEqual({ kind: "common", value: "24px" });
    expect(result?.token).toEqual({ kind: "mixed" });
  });

  it("uses computed values when an element has no authored row", () => {
    const result = projectSelectionProperty(
      "font-size",
      [null, property("16px")],
      ["16px", "16px"],
      0,
    );

    expect(result?.value).toEqual({ kind: "common", value: "16px" });
    expect(result?.primaryRow).toBeNull();
  });
});

describe("intersectTokenEntries", () => {
  const entry = (name: string, value: string) => ({ name, value });

  it("keeps one selection's tokens unchanged", () => {
    const only = [entry("--a", "1"), entry("--b", "2")];
    expect(intersectTokenEntries([only])).toEqual(only);
  });

  it("keeps only tokens that every selected element offers with the same value", () => {
    expect(intersectTokenEntries([
      [entry("--a", "1"), entry("--b", "2"), entry("--c", "3")],
      [entry("--c", "3"), entry("--a", "1"), entry("--b", "other")],
      [entry("--a", "1"), entry("--c", "3")],
    ])).toEqual([entry("--a", "1"), entry("--c", "3")]);
    expect(intersectTokenEntries([])).toEqual([]);
  });
});
