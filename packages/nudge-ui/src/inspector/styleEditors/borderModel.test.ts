import { describe, expect, it } from "vitest";
import type { BorderStructure, ResolvedProperty } from "../../css/model/index.ts";
import {
  BORDER_SIDES,
  borderDeclarations,
  hasVisibleBorder,
  readBorderEditor,
  type BorderSource,
  type ComputedStyleReader,
} from "./borderModel.ts";

function row(property: string, fields: Partial<ResolvedProperty> = {}): ResolvedProperty {
  return {
    property,
    tokenName: null,
    declaredValue: "",
    resolvedValue: "",
    confidence: "exact",
    evidence: { reason: "test fixture" },
    ...fields,
  };
}

function structure(parts: Partial<BorderStructure>): BorderStructure {
  return { kind: "border", sourceProperty: "border", width: "1px", style: "solid", color: "black", colorTokenName: null, ...parts };
}

function computedFrom(values: Readonly<Record<string, string>>): ComputedStyleReader {
  return (property, fallback) => values[property] ?? fallback;
}

/** Computed longhands for a border that is the same on every side. */
function uniformSides(width: string, style: string, color: string): Record<string, string> {
  return Object.fromEntries(BORDER_SIDES.flatMap((side) => [
    [`border-${side}-width`, width],
    [`border-${side}-style`, style],
    [`border-${side}-color`, color],
  ]));
}

function source(rows: ResolvedProperty[], computed: Readonly<Record<string, string>> = {}): BorderSource {
  return { rows, computed: computedFrom(computed) };
}

describe("readBorderEditor", () => {
  it("links sides that compute the same border", () => {
    const state = readBorderEditor(source([], uniformSides("1px", "solid", "rgb(0, 0, 0)")), { group: false });

    expect(state.sidesLinked).toBe(true);
  });

  it("keeps sides apart when one side computes a different width", () => {
    const computed = { ...uniformSides("1px", "solid", "rgb(0, 0, 0)"), "border-left-width": "2px" };

    expect(readBorderEditor(source([], computed), { group: false }).sidesLinked).toBe(false);
  });

  it("keeps sides apart when only one side binds a color token", () => {
    const rows = [
      row("border-top-color", { declaredValue: "rgb(0, 0, 0)", tokenName: "--ink" }),
      row("border-right-color", { declaredValue: "rgb(0, 0, 0)" }),
      row("border-bottom-color", { declaredValue: "rgb(0, 0, 0)" }),
      row("border-left-color", { declaredValue: "rgb(0, 0, 0)" }),
    ];

    expect(readBorderEditor(source(rows, uniformSides("1px", "solid", "rgb(0, 0, 0)")), { group: false }).sidesLinked).toBe(false);
  });

  it("treats a lone component shorthand row as linked", () => {
    const rows = [row("border-width", { declaredValue: "1px 2px" })];
    const computed = { ...uniformSides("1px", "solid", "rgb(0, 0, 0)"), "border-right-width": "2px", "border-left-width": "2px" };

    expect(readBorderEditor(source(rows, computed), { group: false }).sidesLinked).toBe(true);
  });

  it("never links a group selection", () => {
    const state = readBorderEditor(source([], uniformSides("1px", "solid", "rgb(0, 0, 0)")), { group: true });

    expect(state.sidesLinked).toBe(false);
  });

  it("exposes an unstructured border shorthand for raw editing", () => {
    const shorthand = row("border", { authored: "1px solid var(--line)" });

    expect(readBorderEditor(source([shorthand]), { group: false }).rawShorthandRow).toBe(shorthand);
  });

  it("drops the raw shorthand once any row is structured", () => {
    const rows = [row("border", { authored: "1px solid var(--line)" }), row("border-top-width", { structure: structure({}) })];

    expect(readBorderEditor(source(rows), { group: false }).rawShorthandRow).toBeNull();
  });

  it("drops the raw shorthand for a group selection", () => {
    const rows = [row("border", { authored: "1px solid var(--line)" })];

    expect(readBorderEditor(source(rows), { group: true }).rawShorthandRow).toBeNull();
  });

  it("reports that a hidden linked style draws no line", () => {
    const state = readBorderEditor(source([], { "border-style": "hidden" }), { group: false });

    expect(state.linkedStyleDraws).toBe(false);
  });

  it("prefers a structured style over authored text and the computed style", () => {
    const rows = [row("border-style", { authored: "dashed", structure: structure({ style: "NONE" }) })];

    expect(readBorderEditor(source(rows, { "border-style": "solid" }), { group: false }).linkedStyleDraws).toBe(false);
  });

  it("falls back to the computed style when authored text is not a border style", () => {
    const rows = [row("border-style", { authored: "var(--line-style)" })];

    expect(readBorderEditor(source(rows, { "border-style": "none" }), { group: false }).linkedStyleDraws).toBe(false);
  });

  it("backs linked fields with the component shorthand row, then the top side row", () => {
    const widthRow = row("border-width", { declaredValue: "2px" });
    const rows = [widthRow, row("border-top-color", { authored: "var(--ink)", tokenName: "--ink" })];

    const { linkedRows } = readBorderEditor(source(rows), { group: false });

    expect(linkedRows.width).toBe(widthRow);
    expect(linkedRows.color).toMatchObject({ property: "border-color", tokenName: "--ink" });
    expect(linkedRows.style).toBeNull();
  });
});

describe("hasVisibleBorder", () => {
  it("detects one side that draws a line", () => {
    const computed = { ...uniformSides("0px", "none", "black"), "border-left-width": "1px", "border-left-style": "solid" };

    expect(hasVisibleBorder(computedFrom(computed))).toBe(true);
  });

  it("ignores widths whose style is none or hidden", () => {
    const computed = { ...uniformSides("1px", "none", "black"), "border-top-style": "hidden" };

    expect(hasVisibleBorder(computedFrom(computed))).toBe(false);
  });

  it("ignores a solid style with zero width, as a `0 solid` reset leaves", () => {
    expect(hasVisibleBorder(computedFrom(uniformSides("0px", "solid", "black")))).toBe(false);
  });
});

describe("borderDeclarations", () => {
  it("adds a one pixel solid border", () => {
    expect(borderDeclarations(source([]), { kind: "add" })).toEqual([{ property: "border", value: "1px solid" }]);
  });

  it("removes the border width but keeps a solid style", () => {
    expect(borderDeclarations(source([]), { kind: "remove" })).toEqual([{ property: "border", value: "0 solid" }]);
  });

  it("links sides to the top side's computed values", () => {
    const computed = {
      ...uniformSides("1px", "solid", "black"),
      "border-top-width": "2px",
      "border-top-style": "dashed",
      "border-top-color": "rgb(18, 52, 86)",
    };

    expect(borderDeclarations(source([], computed), { kind: "link-sides" })).toEqual([
      { property: "border-style", value: "dashed" },
      { property: "border-width", value: "2px" },
      { property: "border-color", value: "rgb(18, 52, 86)" },
    ]);
  });

  it("links sides to the top side's authored token rather than its computed color", () => {
    const rows = [row("border-top-color", { authored: "var(--ink)", tokenName: "--ink" })];
    const computed = uniformSides("1px", "solid", "rgb(0, 0, 0)");

    expect(borderDeclarations(source(rows, computed), { kind: "link-sides" })).toContainEqual({ property: "border-color", value: "var(--ink)" });
  });

  it("writes an offered style to the chosen property", () => {
    const intent = { kind: "set-style", property: "border-left-style", style: "dotted" } as const;

    expect(borderDeclarations(source([]), intent)).toEqual([{ property: "border-left-style", value: "dotted" }]);
  });

  it("writes nothing for a style the menu does not offer", () => {
    const intent = { kind: "set-style", property: "border-style", style: "wavy" } as const;

    expect(borderDeclarations(source([]), intent)).toEqual([]);
  });
});
