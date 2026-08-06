// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { TokenEntry, TokenOrigin, TokenTable } from "../model/index.ts";
import type { TokenInterpretationContext } from "./tokenInterpretation.ts";
import {
  interpretStructuredValue,
  type Directionality,
  type StructuredField,
  type StructuredValuesContext,
} from "./structuredValues.ts";

/**
 * Fast Interface tests for the structured-values Module (plan slice 3.5).
 * These pin box/spacing, border, border-radius, logical-side, and supported
 * font decomposition in isolation: the module takes explicit token knowledge
 * and explicit `Directionality` facts and never touches the DOM or CSSOM.
 * Expected values are byte-identical to the pre-migration characterization and
 * conformance assertions.
 */

function entry(name: string, value: string, extra: Partial<TokenEntry> = {}): TokenEntry {
  return { name, value, source: "theme.css:1", ...extra };
}

function table(entries: TokenEntry[]): TokenTable {
  const out: TokenTable = {};
  for (const item of entries) {
    out[item.name] = item;
    if (item.cssName) out[item.cssName] = item;
  }
  return out;
}

function tokenContext(tokenTable: TokenTable, localAliases: ReadonlyMap<string, string> = new Map()): TokenInterpretationContext {
  return { table: tokenTable, localAliases };
}

function ctx(tokenTable: TokenTable, overrides: Partial<StructuredValuesContext> = {}): StructuredValuesContext {
  return { tokenContext: tokenContext(tokenTable), ...overrides };
}

function fieldMap(fields: StructuredField[]): Map<string, StructuredField> {
  return new Map(fields.map((field) => [field.property, field]));
}

const LTR: Directionality = { direction: "ltr", writingMode: "horizontal-tb" };
const RTL: Directionality = { direction: "rtl", writingMode: "horizontal-tb" };
const VERTICAL_RL: Directionality = { direction: "ltr", writingMode: "vertical-rl" };
const VERTICAL_LR: Directionality = { direction: "ltr", writingMode: "vertical-lr" };
const SIDEWAYS_RL: Directionality = { direction: "ltr", writingMode: "sideways-rl" };
const SIDEWAYS_LR: Directionality = { direction: "ltr", writingMode: "sideways-lr" };

describe("interpretStructuredValue — box/spacing expansion", () => {
  it.each([
    ["8px", ["8px", "8px", "8px", "8px"]],
    ["8px 16px", ["8px", "16px", "8px", "16px"]],
    ["8px 16px 24px", ["8px", "16px", "24px", "16px"]],
    ["8px 16px 24px 32px", ["8px", "16px", "24px", "32px"]],
  ] as const)("expands margin %s into top/right/bottom/left", (value, expected) => {
    const fields = interpretStructuredValue("margin", value, ctx(table([])));
    expect(fields.map((field) => field.property)).toEqual([
      "margin-top", "margin-right", "margin-bottom", "margin-left",
    ]);
    expect(fields.map((field) => field.resolvedValue)).toEqual(expected);
    expect(fields.every((field) => field.capability === "box-sides")).toBe(true);
  });

  it.each([
    ["inset", "0", ["top", "right", "bottom", "left"], ["0", "0", "0", "0"]],
    ["inset", "0 4px", ["top", "right", "bottom", "left"], ["0", "4px", "0", "4px"]],
  ] as const)("expands %s into physical inset longhands", (property, value, expectedProps, expectedValues) => {
    const fields = interpretStructuredValue(property, value, ctx(table([])));
    expect(fields.map((field) => field.property)).toEqual(expectedProps);
    expect(fields.map((field) => field.resolvedValue)).toEqual(expectedValues);
    // Physical inset longhands (`top`/`right`/...) classify atomic, exactly as
    // the legacy resolver projected them.
    expect(fields.every((field) => field.capability === "atomic")).toBe(true);
  });

  it("keeps each side's token attribution when a padding shorthand uses multiple tokens", () => {
    const fields = interpretStructuredValue("padding", "var(--space-1) var(--space-2) var(--space-3)", ctx(table([
      entry("--space-1", "4px"),
      entry("--space-2", "8px"),
      entry("--space-3", "12px"),
    ])));
    const byProp = fieldMap(fields);
    expect(byProp.get("padding-top")?.tokenName).toBe("--space-1");
    expect(byProp.get("padding-right")?.tokenName).toBe("--space-2");
    expect(byProp.get("padding-bottom")?.tokenName).toBe("--space-3");
    expect(byProp.get("padding-left")?.tokenName).toBe("--space-2");
  });

  it("expands a multi-value spacing token once into every side with provenance", () => {
    const fields = interpretStructuredValue("margin", "var(--space-set)", ctx(table([
      entry("--space-set", "4px 8px 12px 16px"),
    ])));
    const byProp = fieldMap(fields);
    expect(byProp.get("margin-top")?.resolvedValue).toBe("4px");
    expect(byProp.get("margin-right")?.resolvedValue).toBe("8px");
    expect(byProp.get("margin-bottom")?.resolvedValue).toBe("12px");
    expect(byProp.get("margin-left")?.resolvedValue).toBe("16px");
    for (const field of fields) {
      expect(field.declaredValue).toBe("var(--space-set)");
      expect(field.tokenName).toBe("--space-set");
      expect(field.sourceProperty).toBe("margin");
    }
  });

  it("keeps a fallback token reference on every projected side", () => {
    const fields = interpretStructuredValue("padding", "var(--space-4, 20px)", ctx(table([
      entry("--space-4", "16px"),
    ])));
    expect(fields).toHaveLength(4);
    expect(fields[0]).toMatchObject({ tokenName: "--space-4", declaredValue: "var(--space-4, 20px)" });
    expect(fields[0]?.modifiers).toEqual([{ kind: "fallback", value: "20px" }]);
  });

  it("keeps functional spacing expressions raw per side with attribution", () => {
    const fields = interpretStructuredValue("padding", "clamp(8px, var(--space-1), 24px)", ctx(table([
      entry("--space-1", "16px"),
    ])));
    expect(fields).toHaveLength(4);
    expect(fields[0]).toMatchObject({ capability: "raw", tokenName: "--space-1" });
    expect(fields.every((field) => field.capability === "raw")).toBe(true);
  });

  it("falls back to a single raw row for too many spacing values", () => {
    const fields = interpretStructuredValue("padding", "8px 16px 24px 32px 40px", ctx(table([])));
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      property: "padding",
      capability: "raw",
      diagnostic: "unsupported structured value for padding",
    });
  });
});

describe("interpretStructuredValue — logical sides under directionality", () => {
  it("maps padding-inline two-value forms through direction", () => {
    const ltr = interpretStructuredValue("padding-inline", "6px 12px", ctx(table([]), { directionality: LTR }));
    expect(fieldMap(ltr).get("padding-left")?.resolvedValue).toBe("6px");
    expect(fieldMap(ltr).get("padding-right")?.resolvedValue).toBe("12px");

    const rtl = interpretStructuredValue("padding-inline", "6px 12px", ctx(table([]), { directionality: RTL }));
    expect(fieldMap(rtl).get("padding-right")?.resolvedValue).toBe("6px");
    expect(fieldMap(rtl).get("padding-left")?.resolvedValue).toBe("12px");
  });

  it("maps inline-start/end through direction", () => {
    const ltrStart = interpretStructuredValue("padding-inline-start", "10px", ctx(table([]), { directionality: LTR }));
    expect(ltrStart.map((field) => field.property)).toEqual(["padding-left"]);

    const rtlStart = interpretStructuredValue("padding-inline-start", "10px", ctx(table([]), { directionality: RTL }));
    expect(rtlStart.map((field) => field.property)).toEqual(["padding-right"]);

    const ltrEnd = interpretStructuredValue("margin-inline-end", "8px", ctx(table([]), { directionality: LTR }));
    expect(ltrEnd.map((field) => field.property)).toEqual(["margin-right"]);
  });

  it("maps block axis through horizontal writing modes", () => {
    const fields = interpretStructuredValue("margin-block", "6px 10px", ctx(table([]), { directionality: LTR }));
    expect(fieldMap(fields).get("margin-top")?.resolvedValue).toBe("6px");
    expect(fieldMap(fields).get("margin-bottom")?.resolvedValue).toBe("10px");
  });

  it("maps block axis through vertical writing modes", () => {
    const rl = interpretStructuredValue("margin-block", "6px 10px", ctx(table([]), { directionality: VERTICAL_RL }));
    expect(fieldMap(rl).get("margin-right")?.resolvedValue).toBe("6px");
    expect(fieldMap(rl).get("margin-left")?.resolvedValue).toBe("10px");

    const lr = interpretStructuredValue("margin-block", "6px 10px", ctx(table([]), { directionality: VERTICAL_LR }));
    expect(fieldMap(lr).get("margin-left")?.resolvedValue).toBe("6px");
    expect(fieldMap(lr).get("margin-right")?.resolvedValue).toBe("10px");
  });

  it("maps inline axis through vertical writing modes", () => {
    const fields = interpretStructuredValue("padding-inline", "4px 8px", ctx(table([]), { directionality: VERTICAL_RL }));
    expect(fieldMap(fields).get("padding-top")?.resolvedValue).toBe("4px");
    expect(fieldMap(fields).get("padding-bottom")?.resolvedValue).toBe("8px");
  });

  it("supports sideways writing modes as vertical", () => {
    const fields = interpretStructuredValue("inset-block-start", "0", ctx(table([]), { directionality: SIDEWAYS_RL }));
    expect(fields.map((field) => field.property)).toEqual(["right"]);
  });

  it("maps sideways-lr inline start from the physical bottom", () => {
    const ltr = interpretStructuredValue("padding-inline-start", "4px", ctx(table([]), { directionality: SIDEWAYS_LR }));
    expect(ltr.map((field) => field.property)).toEqual(["padding-bottom"]);

    const rtl = interpretStructuredValue("padding-inline-start", "4px", ctx(table([]), {
      directionality: { direction: "rtl", writingMode: "sideways-lr" },
    }));
    expect(rtl.map((field) => field.property)).toEqual(["padding-top"]);
  });

  it("falls back when a single-edge logical property gets multiple values", () => {
    const fields = interpretStructuredValue("padding-inline-start", "8px 16px", ctx(table([]), { directionality: LTR }));
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ property: "padding-inline-start", capability: "raw" });
  });

  it("defaults to ltr/horizontal-tb when no directionality is supplied", () => {
    const fields = interpretStructuredValue("padding-inline", "6px 12px", ctx(table([])));
    expect(fieldMap(fields).get("padding-left")?.resolvedValue).toBe("6px");
  });
});

describe("interpretStructuredValue — border shorthand", () => {
  it("projects all fifteen longhands from a full border shorthand with provenance", () => {
    const fields = interpretStructuredValue("border", "2px solid #334455", ctx(table([])));
    expect(fields.map((field) => field.property)).toEqual([
      "border-width", "border-style", "border-color",
      "border-top-width", "border-right-width", "border-bottom-width", "border-left-width",
      "border-top-style", "border-right-style", "border-bottom-style", "border-left-style",
      "border-top-color", "border-right-color", "border-bottom-color", "border-left-color",
    ]);
    for (const field of fields) {
      expect(field.sourceProperty).toBe("border");
      expect(field.capability).toBe("structured");
      expect(field.structure).toMatchObject({ width: "2px", style: "solid", color: "#334455", colorTokenName: null });
    }
    expect(fieldMap(fields).get("border-color")?.resolvedValue).toBe("#334455");
    expect(fieldMap(fields).get("border-top-width")?.resolvedValue).toBe("2px");
  });

  it("fills omitted components with CSS initials", () => {
    expect(interpretStructuredValue("border", "2px solid", ctx(table([])))[0]?.structure)
      .toMatchObject({ width: "2px", style: "solid", color: "currentcolor" });
    expect(interpretStructuredValue("border", "none", ctx(table([])))[0]?.structure)
      .toMatchObject({ width: "medium", style: "none", color: "currentcolor" });
    expect(interpretStructuredValue("border", "hidden", ctx(table([])))[0]?.structure)
      .toMatchObject({ style: "hidden" });
  });

  it("accepts any component order", () => {
    const fields = interpretStructuredValue("border", "#9b4dca double 3px", ctx(table([])));
    expect(fieldMap(fields).get("border-color")?.resolvedValue).toBe("#9b4dca");
    expect(fieldMap(fields).get("border-width")?.resolvedValue).toBe("3px");
    expect(fieldMap(fields).get("border-style")?.resolvedValue).toBe("double");
  });

  it("resolves a token color once and reuses it on every color longhand", () => {
    const fields = interpretStructuredValue("border", "1px solid var(--color-border)", ctx(table([
      entry("--color-border", "#334455", { cssName: "--color-border" }),
    ])));
    const colors = fields.filter((field) => field.property.endsWith("color"));
    expect(colors).toHaveLength(5);
    for (const field of colors) {
      expect(field.tokenName).toBe("--color-border");
      expect(field.tokens).toEqual([{ name: "--color-border", origin: "project" }]);
    }
    expect(colors[0]?.structure).toMatchObject({ color: "var(--color-border)", colorTokenName: "--color-border" });
    expect(fieldMap(fields).get("border-top-width")?.tokenName).toBeNull();
    expect(fieldMap(fields).get("border-top-width")?.tokens).toEqual([]);
  });

  it("resolves width and style tokens once and reuses their attribution", () => {
    const fields = interpretStructuredValue("border", "var(--border-width) var(--border-style) red", ctx(table([
      entry("--border-width", "2px"),
      entry("--border-style", "dashed"),
    ])));
    expect(fieldMap(fields).get("border-width")).toMatchObject({ tokenName: "--border-width", resolvedValue: "2px" });
    expect(fieldMap(fields).get("border-top-width")).toMatchObject({ tokenName: "--border-width", resolvedValue: "2px" });
    expect(fieldMap(fields).get("border-style")).toMatchObject({ tokenName: "--border-style", resolvedValue: "dashed" });
  });

  it("uses local aliases to classify border components", () => {
    const localAliases = new Map([["--local-width", "3px"]]);
    const fields = interpretStructuredValue("border", "var(--local-width) solid red", ctx(table([]), {
      tokenContext: tokenContext(table([]), localAliases),
    }));
    expect(fieldMap(fields).get("border-width")).toMatchObject({ tokenName: "--local-width", resolvedValue: "3px" });
  });

  it("projects a border-side shorthand into three longhands", () => {
    const fields = interpretStructuredValue("border-top", "3px dotted var(--color-accent)", ctx(table([
      entry("--color-accent", "#ee1166"),
    ])));
    expect(fields.map((field) => field.property)).toEqual([
      "border-top-width", "border-top-style", "border-top-color",
    ]);
    expect(fields.every((field) => field.sourceProperty === "border-top")).toBe(true);
    expect(fieldMap(fields).get("border-top-color")?.tokenName).toBe("--color-accent");
    expect(fieldMap(fields).get("border-top-width")?.resolvedValue).toBe("3px");
  });

  it("rejects css-wide keywords", () => {
    for (const value of ["inherit", "initial", "unset", "revert", "revert-layer"]) {
      const fields = interpretStructuredValue("border", value, ctx(table([])));
      expect(fields).toHaveLength(1);
      expect(fields[0]).toMatchObject({ property: "border", capability: "raw" });
    }
  });

  it("keeps ambiguous, slash, image, and multi-value forms conservative", () => {
    for (const value of ["1px 2px", "solid dashed", "1px solid red 2px", "red / 10%", "linear-gradient(red, blue) 2px solid", "url(a.png) solid"]) {
      const fields = interpretStructuredValue("border", value, ctx(table([])));
      expect(fields, value).toHaveLength(1);
      expect(fields[0]?.property, value).toBe("border");
      expect(fields[0]?.capability, value).toBe("raw");
    }
  });

  it("keeps an unresolved variable border conservative", () => {
    const fields = interpretStructuredValue("border", "2px solid var(--missing-token)", ctx(table([])));
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({
      property: "border",
      capability: "raw",
      diagnostic: "unsupported structured value for border",
    });
  });
});

describe("interpretStructuredValue — border-radius corners", () => {
  it.each([
    ["8px", ["8px", "8px", "8px", "8px"]],
    ["4px 12px", ["4px", "12px", "4px", "12px"]],
    ["4px 8px 12px", ["4px", "8px", "12px", "8px"]],
    ["2px 4px 6px 8px", ["2px", "4px", "6px", "8px"]],
  ] as const)("expands border-radius %s into the four corners", (value, expected) => {
    const fields = interpretStructuredValue("border-radius", value, ctx(table([])));
    expect(fields.map((field) => field.property)).toEqual([
      "border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius",
    ]);
    expect(fields.map((field) => field.resolvedValue)).toEqual(expected);
    expect(fields.every((field) => field.capability === "atomic")).toBe(true);
    expect(fields.every((field) => field.sourceProperty === "border-radius")).toBe(true);
  });

  it("expands a multi-value radius token into multiple corners with one interpretation", () => {
    const fields = interpretStructuredValue("border-radius", "var(--radius)", ctx(table([
      entry("--radius", "8px 12px"),
    ])));
    expect(fields.map((field) => field.resolvedValue)).toEqual(["8px", "12px", "8px", "12px"]);
    for (const field of fields) {
      expect(field.tokenName).toBe("--radius");
      expect(field.declaredValue).toBe("var(--radius)");
    }
  });

  it("keeps slash-separated radius forms conservative", () => {
    const fields = interpretStructuredValue("border-radius", "8px / 4px", ctx(table([])));
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ property: "border-radius", declaredValue: "8px / 4px" });
    expect(fields[0]?.capability).toBe("raw");
  });

  it("keeps too-many-value radius forms conservative", () => {
    const fields = interpretStructuredValue("border-radius", "2px 4px 6px 8px 10px", ctx(table([])));
    expect(fields).toHaveLength(1);
    expect(fields[0]?.property).toBe("border-radius");
  });
});

describe("interpretStructuredValue — supported font decomposition", () => {
  it("decomposes an unambiguous font shorthand", () => {
    const fields = interpretStructuredValue("font", 'italic 700 1.25rem/1.4 "Aster Display", Georgia, serif', ctx(table([])));
    const byProp = fieldMap(fields);
    expect(byProp.get("font-family")).toMatchObject({ declaredValue: '"Aster Display", Georgia, serif', sourceProperty: "font" });
    expect(byProp.get("font-size")).toMatchObject({ declaredValue: "1.25rem", capability: "atomic" });
    expect(byProp.get("font-weight")).toMatchObject({ declaredValue: "700", capability: "atomic" });
    // Keyword style components are classified raw by the value policy, exactly
    // as the legacy resolver projected them.
    expect(byProp.get("font-style")).toMatchObject({ declaredValue: "italic", capability: "raw" });
    expect(byProp.get("line-height")).toMatchObject({ declaredValue: "1.4", capability: "atomic" });
  });

  it("keeps system-font shorthands raw", () => {
    const fields = interpretStructuredValue("font", "menu", ctx(table([])));
    expect(fields).toHaveLength(1);
    expect(fields[0]).toMatchObject({ property: "font", declaredValue: "menu", capability: "raw" });
  });

  it("keeps percentage-sized variants raw", () => {
    const fields = interpretStructuredValue("font", "italic 50% 1.25rem/1.4 Georgia", ctx(table([])));
    expect(fields).toHaveLength(1);
    expect(fields[0]?.property).toBe("font");
  });

  it("keeps family-without-size shorthands conservative", () => {
    const fields = interpretStructuredValue("font", 'italic 700 "Aster Display", Georgia', ctx(table([])));
    expect(fields).toHaveLength(1);
    expect(fields[0]?.property).toBe("font");
  });

  it("keeps unsupported font prefix components conservative", () => {
    for (const value of ["small-caps 16px serif", "condensed 16px serif", "italic oblique 16px serif"]) {
      const fields = interpretStructuredValue("font", value, ctx(table([])));
      expect(fields, value).toHaveLength(1);
      expect(fields[0], value).toMatchObject({
        property: "font",
        capability: "raw",
        diagnostic: "unsupported structured value for font",
      });
    }
  });
});

describe("one interpretation tree", () => {
  it("interprets a border color token once for every projected color longhand", () => {
    let resolutions = 0;
    const tokenCtx: TokenInterpretationContext = {
      table: table([entry("--color-border", "#334455", { cssName: "--color-border" })]),
      resolveOrigin: (_entry: TokenEntry | undefined): TokenOrigin => {
        resolutions += 1;
        return "project";
      },
    };
    const fields = interpretStructuredValue("border", "1px solid var(--color-border)", { tokenContext: tokenCtx });
    const colors = fields.filter((field) => field.property.endsWith("color"));
    expect(colors).toHaveLength(5);
    expect(resolutions).toBe(1);
    expect(new Set(colors.map((field) => field.tokenName))).toEqual(new Set(["--color-border"]));
    expect(new Set(colors.map((field) => JSON.stringify(field.tokens))).size).toBe(1);
    expect(fields[0]?.structure?.colorTokenName).toBe("--color-border");
  });

  it("interprets each distinct spacing token once, reusing it across sides", () => {
    let resolutions = 0;
    const tokenCtx: TokenInterpretationContext = {
      table: table([entry("--space-1", "4px"), entry("--space-2", "8px")]),
      resolveOrigin: (_entry: TokenEntry | undefined): TokenOrigin => {
        resolutions += 1;
        return "project";
      },
    };
    const fields = interpretStructuredValue("padding", "var(--space-1) var(--space-2)", { tokenContext: tokenCtx });
    expect(fields).toHaveLength(4);
    expect(resolutions).toBe(2);
    expect(fieldMap(fields).get("padding-top")?.tokenName).toBe("--space-1");
    expect(fieldMap(fields).get("padding-right")?.tokenName).toBe("--space-2");
    expect(fieldMap(fields).get("padding-bottom")?.tokenName).toBe("--space-1");
    expect(fieldMap(fields).get("padding-left")?.tokenName).toBe("--space-2");
  });

  it("interprets a logical-side token once and reuses it across physical sides", () => {
    let resolutions = 0;
    const tokenCtx: TokenInterpretationContext = {
      table: table([entry("--space-inline", "4px")]),
      resolveOrigin: () => {
        resolutions += 1;
        return "project";
      },
    };
    const fields = interpretStructuredValue("padding-inline", "var(--space-inline)", { tokenContext: tokenCtx });
    expect(fields).toHaveLength(2);
    expect(resolutions).toBe(1);
    expect(fields.every((field) => field.tokenName === "--space-inline")).toBe(true);
  });

  it("interprets a multi-value radius token once for every corner", () => {
    let resolutions = 0;
    const tokenCtx: TokenInterpretationContext = {
      table: table([entry("--radius", "8px 12px")]),
      resolveOrigin: (_entry: TokenEntry | undefined): TokenOrigin => {
        resolutions += 1;
        return "project";
      },
    };
    const fields = interpretStructuredValue("border-radius", "var(--radius)", { tokenContext: tokenCtx });
    expect(fields).toHaveLength(4);
    expect(resolutions).toBe(1);
    expect(fields.every((field) => field.tokenName === "--radius")).toBe(true);
  });
});
