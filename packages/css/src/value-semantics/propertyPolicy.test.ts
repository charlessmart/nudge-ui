// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import type { TokenEntry } from "../model/index.ts";
import {
  browserCssGrammar,
  classifyEditCapability,
  classifyToken,
  getCompatibleTokenCandidates,
  groupForProperty,
  presentationForToken,
  semanticSlotForProperty,
  type CssValueGrammar,
} from "./propertyPolicy.ts";

/**
 * Fast Interface tests for the value-semantics property/value policy
 * (plan slice 3.3): capability classification, property→semantic-slot
 * knowledge, presentation grouping, and compatible-token candidate selection
 * behind one implementation. Eligibility is decided by resolved concrete value
 * plus the injected browser grammar; names never grant eligibility.
 */

function entry(name: string, value: string, extra: Partial<TokenEntry> = {}): TokenEntry {
  return { name, value, source: "theme.css:1", ...extra };
}

function grammar(accepted: ReadonlyArray<readonly [string, string]>): CssValueGrammar {
  const values = new Set(accepted.map(([property, value]) => `${property}\u0000${value}`));
  return { supports: vi.fn((property, value) => values.has(`${property}\u0000${value}`)) };
}

describe("classifyEditCapability (edit capability classifier)", () => {
  it("classifies each EditCapability the UI renders", () => {
    const cases: Array<[string, string, string]> = [
      ["font-size", "16px", "atomic"],
      ["color", "#f00", "color"],
      ["border-top-width", "5px", "atomic"],
      ["border-radius", "8px", "atomic"],
      ["font-weight", "650", "atomic"],
      ["line-height", "1.45", "atomic"],
      ["letter-spacing", "-.0125em", "atomic"],
      ["color", "#1a1a2e", "color"],
      ["background-color", "rgb(0 0 0 / 25%)", "color"],
      ["fill", "var(--color-accent)", "color"],
      ["stroke", "var(--color-accent)", "color"],
      ["color", "var(--surface, hotpink)", "color"],
      ["color", "color-mix(in oklab, var(--color-primary) 50%, transparent)", "color"],
      ["color", "transparent", "color"],
      ["margin", "8px", "box-sides"],
      ["padding-top", "var(--space-4)", "box-sides"],
      ["inset", "0", "box-sides"],
      ["padding", "clamp(8px, 2vw, 24px)", "raw"],
      ["border", "2px solid red", "structured"],
      ["border-color", "var(--color-border)", "structured"],
      ["border-top", "1px solid var(--color-accent)", "raw"],
      ["font", 'italic 700 1.25rem/1.4 "Aster Display"', "composite"],
      ["box-shadow", "0 2px 4px rgb(0 0 0 / .15)", "composite"],
      ["background", "url(a.png) no-repeat", "composite"],
      ["animation", "spin 2s linear infinite", "composite"],
      ["font-size", "clamp(1rem, 1vw + .78rem, 1.35rem)", "raw"],
      ["margin-top", "min(8px, 2vw)", "raw"],
      ["line-height", "calc(1em + .5rem)", "raw"],
      ["letter-spacing", "max(-.03em, calc(-.012em - .08vw))", "raw"],
      ["width", "env(safe-area-inset-left)", "raw"],
      ["width", "anchor-size(width)", "raw"],
      ["border-width", "2px 4px 6px 8px", "raw"],
      ["border-style", "solid dashed", "raw"],
    ];
    for (const [property, authored, expected] of cases) {
      expect(classifyEditCapability(property, authored), `${property}: ${authored}`).toBe(expected);
    }
  });

  it("keeps the raw-function check ahead of spacing/border classification", () => {
    expect(classifyEditCapability("margin", "clamp(8px, 2vw, 24px)")).toBe("raw");
    expect(classifyEditCapability("border", "color-mix(in srgb, red 10%, transparent)")).toBe("structured");
    expect(classifyEditCapability("border-top", "1px solid var(--color-accent)")).toBe("raw");
    expect(classifyEditCapability("border-top-width", "5px")).toBe("atomic");
  });
});

describe("semantic slot mapping", () => {
  it("maps properties to semantic slots", () => {
    expect(semanticSlotForProperty("color")).toBe("color");
    expect(semanticSlotForProperty("background-color")).toBe("color");
    expect(semanticSlotForProperty("border-top-color")).toBe("color");
    expect(semanticSlotForProperty("fill")).toBe("color");
    expect(semanticSlotForProperty("box-shadow")).toBe("shadow");
    expect(semanticSlotForProperty("border-radius")).toBe("radius");
    expect(semanticSlotForProperty("border-top-left-radius")).toBe("radius");
    expect(semanticSlotForProperty("font-family")).toBe("font-family");
    expect(semanticSlotForProperty("font-size")).toBe("font-size");
    expect(semanticSlotForProperty("font-weight")).toBe("font-weight");
    expect(semanticSlotForProperty("line-height")).toBe("line-height");
    expect(semanticSlotForProperty("letter-spacing")).toBe("letter-spacing");
    expect(semanticSlotForProperty("padding")).toBe("length");
    expect(semanticSlotForProperty("border-top-width")).toBe("length");
    expect(semanticSlotForProperty("padding-horizontal")).toBe("length");
    expect(semanticSlotForProperty("gap")).toBe("length");
    expect(semanticSlotForProperty("display")).toBeNull();
  });

  it("groups properties for the token picker", () => {
    expect(groupForProperty("color")).toBe("color");
    expect(groupForProperty("margin")).toBe("spacing");
    expect(groupForProperty("border-radius")).toBe("radius");
    expect(groupForProperty("box-shadow")).toBe("shadow");
    expect(groupForProperty("font-size")).toBe("typography");
    expect(groupForProperty("line-height")).toBe("typography");
    expect(groupForProperty("letter-spacing")).toBe("typography");
    expect(groupForProperty("display")).toBe("generic");
    expect(groupForProperty("color", "length")).toBe("spacing");
  });
});

describe("getCompatibleTokenCandidates", () => {
  const ENTRIES: TokenEntry[] = [
    { name: "--content-primary", value: "#171717", source: "theme.css:1" },
    { name: "--content-secondary", value: "#6b7280", source: "theme.css:2" },
    { name: "--color-misleading", value: "8px", source: "theme.css:3" },
    { name: "--spacing-200", value: "8px", source: "theme.css:4" },
    { name: "--border-radius-medium", value: "8px", source: "theme.css:5" },
    { name: "--unfamiliar-shadow", value: "0 1px 2px #000", source: "theme.css:6" },
  ];

  it("uses the concrete CSS value rather than a token name to determine eligibility", () => {
    const css = grammar([
      ["color", "#171717"],
      ["color", "#6b7280"],
    ]);

    const candidates = getCompatibleTokenCandidates({
      property: "color",
      entries: ENTRIES,
      currentToken: "--content-primary",
      grammar: css,
    });

    expect(candidates.map(({ entry }) => entry.name)).toEqual([
      "--content-primary",
      "--content-secondary",
    ]);
    expect(css.supports).toHaveBeenCalledWith("color", "#171717");
    expect(css.supports).toHaveBeenCalledWith("color", "8px");
  });

  it("a name never grants eligibility: a token named --color-* with a non-color value is excluded", () => {
    const css = grammar([["color", "#171717"]]);
    const candidates = getCompatibleTokenCandidates({
      property: "color",
      entries: [
        entry("--color-hotpink-x", "8px"),
        entry("--content-primary", "#171717"),
      ],
      currentToken: null,
      grammar: css,
    });
    expect(candidates.map(({ entry }) => entry.name)).toEqual(["--content-primary"]);
  });

  it("keeps compatible dimensions with unfamiliar names and ranks the property-specific presentation first", () => {
    const css = grammar([["border-radius", "8px"]]);

    const candidates = getCompatibleTokenCandidates({
      property: "border-radius",
      entries: ENTRIES,
      currentToken: null,
      grammar: css,
    });

    expect(candidates.map(({ entry }) => entry.name)).toEqual([
      "--border-radius-medium",
      "--color-misleading",
      "--spacing-200",
    ]);
    expect(candidates.map(({ group }) => group)).toEqual(["radius", "color", "spacing"]);
  });

  it("normalises synthetic paired spacing controls to the length slot", () => {
    const css = grammar([["margin", "8px"]]);

    const candidates = getCompatibleTokenCandidates({
      property: "padding-horizontal",
      entries: ENTRIES,
      currentToken: null,
      grammar: css,
    });

    expect(candidates.map(({ entry }) => entry.name)).toEqual([
      "--spacing-200",
      "--border-radius-medium",
      "--color-misleading",
    ]);
  });

  it("resolves a custom property in the selected element before asking the browser grammar", () => {
    const element = document.createElement("p");
    element.style.setProperty("--content-primary", "#171717");
    document.body.appendChild(element);
    const css = grammar([["color", "#171717"]]);

    const candidates = getCompatibleTokenCandidates({
      element,
      property: "color",
      entries: [{ name: "--content-primary", value: "var(--another-token)", source: "theme.css:1" }],
      currentToken: null,
      grammar: css,
    });

    expect(candidates).toHaveLength(1);
    expect(candidates[0]?.resolvedValue).toBe("#171717");
    expect(css.supports).toHaveBeenCalledWith("color", "#171717");
  });

  it("does not offer unresolved var() expressions as if they were concrete values", () => {
    const css = grammar([["color", "var(--not-resolved)"]]);

    const candidates = getCompatibleTokenCandidates({
      property: "color",
      entries: [{ name: "--unknown", value: "var(--not-resolved)", source: "theme.css:1" }],
      currentToken: null,
      grammar: css,
    });

    expect(candidates).toEqual([]);
    expect(css.supports).not.toHaveBeenCalled();
  });

  it("uses an explicit semantic slot for an embedded color value", () => {
    const css = grammar([["color", "#171717"]]);

    const candidates = getCompatibleTokenCandidates({
      property: "box-shadow",
      slot: "color",
      entries: ENTRIES,
      currentToken: null,
      grammar: css,
    });

    expect(candidates.map(({ entry }) => entry.name)).toEqual(["--content-primary"]);
    expect(css.supports).toHaveBeenCalledWith("color", "#171717");
  });

  it("keeps typography slots distinct through the browser grammar", () => {
    const css = grammar([
      ["font-size", "16px"],
      ["font-weight", "600"],
    ]);
    const entries: TokenEntry[] = [
      { name: "--body-scale", value: "16px", source: "theme.css:1" },
      { name: "--body-emphasis", value: "600", source: "theme.css:2" },
    ];

    expect(getCompatibleTokenCandidates({ property: "font-size", entries, grammar: css })
      .map(({ entry }) => entry.name)).toEqual(["--body-scale"]);
    expect(getCompatibleTokenCandidates({ property: "font-weight", entries, grammar: css })
      .map(({ entry }) => entry.name)).toEqual(["--body-emphasis"]);
  });

  it("retains the current token when an existing declaration is not valid for the requested slot", () => {
    const css = grammar([["color", "#171717"]]);

    const candidates = getCompatibleTokenCandidates({
      property: "color",
      entries: ENTRIES,
      currentToken: "--spacing-200",
      grammar: css,
    });

    expect(candidates.map(({ entry }) => entry.name)).toEqual([
      "--spacing-200",
      "--content-primary",
    ]);
  });

  it("sorts only among eligible values and only by name within a group", () => {
    const css = grammar([
      ["color", "#171717"],
      ["color", "#6b7280"],
      ["color", "#dc2626"],
    ]);
    const candidates = getCompatibleTokenCandidates({
      property: "color",
      entries: [
        entry("--red", "#dc2626"),
        entry("--content-primary", "#171717"),
        entry("--content-secondary", "#6b7280"),
      ],
      currentToken: null,
      grammar: css,
    });
    expect(candidates.map(({ entry }) => entry.name)).toEqual([
      "--content-primary",
      "--content-secondary",
      "--red",
    ]);
  });
});

describe("presentationForToken", () => {
  it("presents by grammar first and name hint second", () => {
    const colorGrammar = grammar([["color", "#171717"]]);
    expect(presentationForToken(entry("--content-primary", "#171717"), colorGrammar).group).toBe("color");
    expect(presentationForToken(entry("--color-misleading", "8px"), grammar([])).group).toBe("color");
    expect(presentationForToken(entry("--spacing-200", "8px"), grammar([])).group).toBe("spacing");
    expect(presentationForToken(entry("--radius-md", "8px"), grammar([])).group).toBe("radius");
    expect(presentationForToken(entry("--unfamiliar-shadow", "0 1px 2px #000"), grammar([])).group).toBe("shadow");
    expect(presentationForToken(entry("--foo", "0 1px 2px #000"), grammar([["box-shadow", "0 1px 2px #000"]])).group).toBe("shadow");
    expect(presentationForToken(entry("--foo", "8px"), grammar([["margin", "8px"]])).group).toBe("spacing");
    expect(presentationForToken(entry("--foo", "var(--x)"), grammar([])).group).toBe("generic");
  });

  it("labels groups with the shared label table", () => {
    expect(presentationForToken(entry("--color-x", "#fff")).label).toBe("Color");
    expect(presentationForToken(entry("--space-x", "8px")).label).toBe("Spacing");
  });

  it("classifyToken gives the name-prefix presentation preference", () => {
    expect(classifyToken("--color-red-500", "#dc2626")).toBe("color");
    expect(classifyToken("--space-4", "16px")).toBe("spacing");
    expect(classifyToken("--radius-md", "8px")).toBe("radius");
    expect(classifyToken("--font-body", "Inter")).toBe("typography");
    expect(classifyToken("--text-sm", "14px")).toBe("typography");
    expect(classifyToken("--leading-normal", "1.5")).toBe("typography");
    expect(classifyToken("--tracking-tight", "-0.018em")).toBe("typography");
    expect(classifyToken("brand.color", "var(--x)")).toBe("color");
    expect(classifyToken("theme.spacing.4", "16px")).toBe("spacing");
    expect(classifyToken("unrelated", "#fff")).toBe("color");
    expect(classifyToken("unrelated", "16px")).toBe("generic");
  });
});

describe("browserCssGrammar seam", () => {


  it("is conservative in a non-browser realm (jsdom has no CSS.supports)", () => {
    const css = browserCssGrammar();
    expect(css.supports("color", "#fff")).toBe(true);
    expect(css.supports("color", "var(--x)")).toBe(false);
    expect(css.supports("color", "8px")).toBe(false);
    expect(css.supports("margin", "8px")).toBe(true);
    expect(css.supports("border-radius", "8px")).toBe(true);
    expect(css.supports("box-shadow", "0 1px 2px #000")).toBe(true);
    expect(css.supports("font-family", "Inter")).toBe(true);
    expect(css.supports("font-family", "#fff")).toBe(false);
    expect(css.supports("font-weight", "700")).toBe(true);
    expect(css.supports("font-weight", "700px")).toBe(false);
    expect(css.supports("display", "block")).toBe(false);
    expect(css.supports("color", "")).toBe(false);
  });
});

describe("arbitrary input does not throw", () => {
  const WEIRD = ["", "   ", "var(", "(((", "\\", '"q"', "#", "10px 10px", "inherit"];

  it.each(WEIRD)("semanticSlotForProperty and groupForProperty tolerate %j", (input) => {
    expect(() => semanticSlotForProperty(input)).not.toThrow();
    expect(() => groupForProperty(input)).not.toThrow();
  });

  it.each(WEIRD)("classifyEditCapability tolerates %j", (input) => {
    expect(() => classifyEditCapability("color", input)).not.toThrow();
    expect(() => classifyEditCapability(input, "8px")).not.toThrow();
  });

  it.each(WEIRD)("classifyToken and presentationForToken tolerate %j", (input) => {
    expect(() => classifyToken(input)).not.toThrow();
    expect(() => presentationForToken(entry(input, "8px"))).not.toThrow();
  });

  it("getCompatibleTokenCandidates tolerates arbitrary entries and a broken grammar", () => {
    expect(() => getCompatibleTokenCandidates({
      property: "color",
      entries: [{ name: "", value: "var(", source: "" }],
      currentToken: "",
      grammar: { supports: () => false },
    })).not.toThrow();
    expect(() => getCompatibleTokenCandidates({
      property: "color",
      entries: [{ name: "--x", value: "var(", source: "" }],
      currentToken: null,
    })).not.toThrow();
  });
});
