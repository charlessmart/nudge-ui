import { describe, expect, it } from "vitest";
import type { ResolvedProperty } from "@nudge-ui/css/model";
import { aggregateProperties, aggregatePropertyValues } from "./aggregateInspection.ts";

function property(
  name: string,
  value: string,
  tokenName: string | null = null,
): ResolvedProperty {
  return {
    property: name,
    tokenName,
    declaredValue: tokenName ? `var(${tokenName})` : value,
    resolvedValue: value,
    authored: tokenName ? `var(${tokenName})` : value,
    confidence: "exact",
    evidence: { reason: "test" },
  };
}

describe("aggregateProperties", () => {
  it("keeps a common value and token attribution", () => {
    const [row] = aggregateProperties([
      { properties: [property("font-size", "24px", "--type-heading")] },
      { properties: [property("font-size", "24px", "--type-heading")] },
    ]);

    expect(row?.aggregate).toMatchObject({
      valueState: "common",
      tokenState: "common",
      values: ["24px", "24px"],
      tokenNames: ["--type-heading", "--type-heading"],
    });
    expect(row?.tokenName).toBe("--type-heading");
    expect(row?.declaredValue).toBe("var(--type-heading)");
  });

  it("marks differing values as Mixed and suppresses the token chip", () => {
    const [row] = aggregateProperties([
      { properties: [property("font-size", "24px", "--type-heading")] },
      { properties: [property("font-size", "20px", "--type-heading")] },
    ]);

    expect(row?.aggregate.valueState).toBe("mixed");
    expect(row?.aggregate.tokenState).toBe("common");
    expect(row?.declaredValue).toBe("Mixed");
    expect(row?.resolvedValue).toBe("Mixed");
    expect(row?.tokenName).toBeNull();
  });

  it("keeps a common value while marking mixed token provenance", () => {
    const [row] = aggregateProperties([
      { properties: [property("color", "#111111", "--color-primary")] },
      { properties: [property("color", "#111111", "--color-brand")] },
    ]);

    expect(row?.aggregate).toMatchObject({ valueState: "common", tokenState: "mixed" });
    expect(row?.declaredValue).toBe("#111111");
    expect(row?.tokenName).toBeNull();
  });

  it("omits properties unavailable on one of the selected elements", () => {
    const rows = aggregateProperties([
      { properties: [property("font-size", "24px"), property("color", "red")] },
      { properties: [property("font-size", "24px")] },
    ]);

    expect(rows.map((row) => row.property)).toEqual(["font-size"]);
  });

  it("aggregates computed values when authored inspection rows are missing", () => {
    const row = aggregatePropertyValues(
      "padding-left",
      [
        { properties: [] },
        { properties: [property("padding-left", "16px")] },
      ],
      ["16px", "16px"],
    );

    expect(row?.aggregate).toMatchObject({
      valueState: "common",
      tokenState: "none",
      values: ["16px", "16px"],
      targetRows: [null, expect.objectContaining({ property: "padding-left" })],
    });
    expect(row?.tokenName).toBeNull();
    expect(row?.resolvedValue).toBe("16px");
  });

  it("marks computed differences as Mixed even when only one target has an authored row", () => {
    const row = aggregatePropertyValues(
      "margin-top",
      [
        { properties: [] },
        { properties: [property("margin-top", "16px")] },
      ],
      ["8px", "16px"],
    );

    expect(row?.aggregate.valueState).toBe("mixed");
    expect(row?.declaredValue).toBe("Mixed");
    expect(row?.resolvedValue).toBe("Mixed");
  });
});
