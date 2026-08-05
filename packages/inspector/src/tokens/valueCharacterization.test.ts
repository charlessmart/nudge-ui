// @vitest-environment jsdom
// Characterization baseline for every exported value helper and every
// UI-consumed ResolvedProperty field (plan slice 3.1). Helpers that are pure
// cascade/orchestration concerns — getTokenTable, getAvailableTokenEntriesForElement,
// getAvailableInteractionStates, getStableTokenProperty, filterTokenRows,
// isTokenContextActive — are covered through the conformance harness and the
// existing resolution/cssomCollector specs rather than duplicated here.
import { afterEach, describe, expect, it } from "vitest";
import type { TokenDefinition, TokenEntry } from "virtual:design-tokens";
import {
  buildTokenTable,
  normalizeColorOpacity,
  parseBorderShorthand,
  replaceColorOpacity,
  replaceColorToken,
  resolvePropertiesFromRules,
  resolveTokenValue,
} from "./resolution.ts";
import type { TokenTable } from "./resolution.ts";
import {
  browserCssGrammar,
  classifyEditCapability,
  classifyToken,
  getCompatibleTokenCandidates,
  groupForProperty,
  presentationForToken,
  semanticSlotForProperty,
  type CssValueGrammar,
} from "@design-tool/css/value-semantics";
import {
  aliasName,
  buildTokenCatalogRows,
  classifyCatalogToken,
  compatibleTokenNames,
  contextLabel,
  createsAliasCycle,
  sourceParts,
  type TokenRuntime,
} from "./catalog.ts";
import { runConformanceFixture } from "../conformance/fixture.ts";
import type { ConformanceFixture } from "../conformance/fixture.ts";
import type { ResolvedProperty } from "@design-tool/css/model";
import { COLOR_CASES } from "../conformance/colorCases.ts";
import { BORDER_CASES } from "../conformance/borderCases.ts";
import { SPACING_CASES } from "../conformance/spacingCases.ts";
import { TYPOGRAPHY_CASES } from "../conformance/typographyCases.ts";

/**
 * Slice 3.1 characterization baseline. These tests pin the CURRENT behavior of
 * every exported value helper and every `ResolvedProperty` field the UI reads,
 * so later migration slices can move implementation behind the
 * `@design-tool/css/value-semantics` seam without drifting. Values come from
 * the conformance corpus so this spec doubles as a migration oracle.
 */

function entry(name: string, value: string, extra: Partial<TokenEntry> = {}): TokenEntry {
  return { name, value, source: "theme.css:1", ...extra };
}

const TABLE: TokenTable = buildTokenTable([
  entry("--space-4", "16px"),
  entry("--space-alias", "var(--space-4)"),
  entry("--color-text-secondary", "#52526b"),
  entry("--color-primary", "#2563eb"),
  entry("--color-danger", "#dc2626"),
  entry("--color-error", "var(--color-danger)"),
  entry("--opacity-muted", "0.35"),
  entry("--a", "var(--b)", { source: "cycle.css:1" }),
  entry("--b", "var(--a)", { source: "cycle.css:2" }),
]);

function colorToken(name: string, value: string): TokenEntry {
  return entry(name, value, { cssName: name });
}

function grammar(accepted: ReadonlyArray<readonly [string, string]>): CssValueGrammar {
  const values = new Set(accepted.map(([property, value]) => `${property}\u0000${value}`));
  return { supports: (property, value) => values.has(`${property}\u0000${value}`) };
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
});

describe("classifyEditCapability (edit capability classifier)", () => {
  it("classifies each EditCapability the UI renders", () => {
    const cases: Array<[string, string, string]> = [
      // atomic
      ["font-size", "16px", "atomic"],
      ["color", "#f00", "color"],
      ["border-top-width", "5px", "atomic"],
      ["border-radius", "8px", "atomic"],
      ["font-weight", "650", "atomic"],
      ["line-height", "1.45", "atomic"],
      ["letter-spacing", "-.0125em", "atomic"],
      // color
      ["color", "#1a1a2e", "color"],
      ["background-color", "rgb(0 0 0 / 25%)", "color"],
      ["fill", "var(--color-accent)", "color"],
      ["stroke", "var(--color-accent)", "color"],
      ["color", "var(--surface, hotpink)", "color"],
      ["color", "color-mix(in oklab, var(--color-primary) 50%, transparent)", "color"],
      ["color", "transparent", "color"],
      // box-sides
      ["margin", "8px", "box-sides"],
      ["padding-top", "var(--space-4)", "box-sides"],
      ["inset", "0", "box-sides"],
      ["padding", "clamp(8px, 2vw, 24px)", "raw"],
      // structured
      ["border", "2px solid red", "structured"],
      ["border-color", "var(--color-border)", "structured"],
      ["border-top", "1px solid var(--color-accent)", "raw"],
      // composite
      ["font", 'italic 700 1.25rem/1.4 "Aster Display"', "composite"],
      ["box-shadow", "0 2px 4px rgb(0 0 0 / .15)", "composite"],
      ["background", "url(a.png) no-repeat", "composite"],
      ["animation", "spin 2s linear infinite", "composite"],
      // raw (unsupported / functional)
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
  });

  it("does not classify border-side shorthands as structured (the resolution branch upgrades them)", () => {
    // `classifyEditCapability` is the raw per-(property, value) classifier. The
    // border resolution branch upgrades rows projected from `border`/`border-side`
    // shorthands to "structured"; the standalone classifier keeps them raw.
    expect(classifyEditCapability("border-top", "1px solid var(--color-accent)")).toBe("raw");
    expect(classifyEditCapability("border-top-width", "5px")).toBe("atomic");
  });
});

describe("normalizeColorOpacity", () => {
  it("normalises fractions and percentages to clamped percents", () => {
    expect(normalizeColorOpacity("0.5")).toBe("50%");
    expect(normalizeColorOpacity("50%")).toBe("50%");
    expect(normalizeColorOpacity("0.35")).toBe("35%");
    expect(normalizeColorOpacity(".5")).toBe("50%");
    expect(normalizeColorOpacity("1")).toBe("100%");
    expect(normalizeColorOpacity("0")).toBe("0%");
    expect(normalizeColorOpacity("0.33333")).toBe("33.333%");
    expect(normalizeColorOpacity("-0.5")).toBe("0%");
    expect(normalizeColorOpacity("1.5")).toBe("100%");
    expect(normalizeColorOpacity("150%")).toBe("100%");
    expect(normalizeColorOpacity("abc")).toBeNull();
    expect(normalizeColorOpacity("")).toBeNull();
  });
});

describe("resolveTokenValue", () => {
  it("resolves a single reference with its primary and leaf token", () => {
    const result = resolveTokenValue("var(--space-4)", TABLE);
    expect(result.tokenName).toBe("--space-4");
    expect(result.resolvedValue).toBe("16px");
    expect(result.leafTokenName).toBe("--space-4");
    expect(result.tokens).toEqual([{ name: "--space-4", origin: "project" }]);
    expect(result.opacity).toBeUndefined();
    expect(result.modifiers).toEqual([]);
    expect(result.cycle).toBeUndefined();
  });

  it("traverses nested alias references and reports the leaf token", () => {
    const result = resolveTokenValue("var(--space-alias)", TABLE);
    expect(result.tokenName).toBe("--space-alias");
    expect(result.resolvedValue).toBe("16px");
    expect(result.leafTokenName).toBe("--space-4");
    expect(result.tokens).toEqual([{ name: "--space-alias", origin: "project" }]);
  });

  it("retains the fallback as a modifier when the primary reference is known", () => {
    const result = resolveTokenValue("var(--color-text-secondary, #333)", TABLE);
    expect(result.tokenName).toBe("--color-text-secondary");
    expect(result.resolvedValue).toBe("#52526b");
    expect(result.modifiers).toEqual([{ kind: "fallback", value: "#333" }]);
  });

  it("keeps an unknown reference with a fallback raw but still reports the fallback modifier", () => {
    const result = resolveTokenValue("var(--unknown-color, hotpink)", TABLE);
    expect(result.tokenName).toBeNull();
    expect(result.resolvedValue).toBe("var(--unknown-color, hotpink)");
    expect(result.tokens).toEqual([]);
    expect(result.modifiers).toEqual([{ kind: "fallback", value: "hotpink" }]);
  });

  it("keeps an unknown reference without fallback unresolved", () => {
    const result = resolveTokenValue("var(--nope)", TABLE);
    expect(result.tokenName).toBeNull();
    expect(result.resolvedValue).toBe("var(--nope)");
    expect(result.tokens).toEqual([]);
  });

  it("terminates alias cycles with a diagnostic-ready cycle flag", () => {
    const result = resolveTokenValue("var(--a)", TABLE);
    expect(result.cycle).toBe("--a");
    expect(result.tokenName).toBe("--a");
    // The cycle resolves to the entry's own declared value.
    expect(result.resolvedValue).toBe("var(--b)");
  });

  it("collects every referenced token including the opacity token while keeping tokenName primary", () => {
    const mix = resolveTokenValue("color-mix(in srgb, var(--color-primary) var(--opacity-muted), transparent)", TABLE);
    expect(mix.tokenName).toBe("--color-primary");
    expect(mix.tokens).toEqual([
      { name: "--color-primary", origin: "project" },
      { name: "--opacity-muted", origin: "project" },
    ]);
    expect(mix.opacity).toMatchObject({ value: "35%", tokenName: "--opacity-muted", source: "color-mix" });
    expect(mix.modifiers).toEqual([{ kind: "alpha", value: "35%" }]);
  });

  it("distinguishes an alpha-only token reference from a color token", () => {
    const result = resolveTokenValue("rgb(37 99 235 / var(--opacity-muted))", TABLE);
    expect(result.tokenName).toBeNull();
    expect(result.resolvedValue).toBe("rgb(37 99 235 / var(--opacity-muted))");
    expect(result.tokens).toEqual([{ name: "--opacity-muted", origin: "project" }]);
    expect(result.opacity).toMatchObject({ value: "35%", tokenName: "--opacity-muted", source: "rgb" });
  });

  it("parses a color-mix alpha component as a percentage", () => {
    const result = resolveTokenValue("color-mix(in oklab, var(--color-primary) 50%, transparent)", TABLE);
    expect(result.tokenName).toBe("--color-primary");
    expect(result.resolvedValue).toBe("#2563eb");
    expect(result.opacity).toMatchObject({ value: "50%", tokenName: null, source: "color-mix" });
  });

  it("deduplicates repeated references", () => {
    const result = resolveTokenValue("calc(var(--space-4) + var(--space-4))", TABLE);
    expect(result.tokens).toEqual([{ name: "--space-4", origin: "project" }]);
    expect(result.tokenName).toBe("--space-4");
  });

  it("collects fallback references alongside the primary reference", () => {
    const result = resolveTokenValue("var(--color-error, var(--color-primary))", TABLE);
    expect(result.tokenName).toBe("--color-error");
    expect(result.resolvedValue).toBe("#dc2626");
    expect(result.tokens).toEqual([
      { name: "--color-error", origin: "project" },
      { name: "--color-primary", origin: "project" },
    ]);
  });
});

describe("replaceColorOpacity", () => {
  it("replaces 8-digit hex alpha", () => {
    expect(replaceColorOpacity("#ff000088", "20%")).toBe("#ff000033");
  });

  it("replaces 4-digit hex alpha", () => {
    expect(replaceColorOpacity("#f008", "20%")).toBe("#f003");
  });

  it("round-trips a 4-digit hex alpha", () => {
    expect(replaceColorOpacity("#f008", "53.3333%")).toBe("#f008");
  });

  it("replaces modern rgb slash alpha", () => {
    expect(replaceColorOpacity("rgb(255 0 0 / 80%)", "50%")).toBe("rgb(255 0 0 / 50%)");
  });

  it("replaces legacy comma alpha", () => {
    expect(replaceColorOpacity("rgba(0, 0, 0, 0.8)", "20%")).toBe("rgba(0, 0, 0, 20%)");
  });

  it("replaces modern hsl slash alpha", () => {
    expect(replaceColorOpacity("hsl(240 100% 50% / 40%)", "80%")).toBe("hsl(240 100% 50% / 80%)");
  });

  it("replaces a color-mix percentage", () => {
    expect(replaceColorOpacity("color-mix(in oklab, var(--color-primary) 50%, transparent)", "20%"))
      .toBe("color-mix(in oklab, var(--color-primary) 20%, transparent)");
  });

  it("replaces a token-backed color-mix percentage", () => {
    expect(replaceColorOpacity("color-mix(in srgb, var(--color-primary) var(--opacity-muted), transparent)", "50%"))
      .toBe("color-mix(in srgb, var(--color-primary) 50%, transparent)");
  });

  it("wraps a plain var() in color-mix and unwraps at 100%", () => {
    expect(replaceColorOpacity("var(--color-primary)", "50%"))
      .toBe("color-mix(in srgb, var(--color-primary) 50%, transparent)");
    expect(replaceColorOpacity("var(--color-primary)", "100%")).toBe("var(--color-primary)");
  });

  it("rejects invalid opacities and unsupported value shapes", () => {
    expect(replaceColorOpacity("var(--color-primary)", "abc")).toBeNull();
    expect(replaceColorOpacity("1px solid red", "50%")).toBeNull();
    expect(replaceColorOpacity("transparent", "50%")).toBeNull();
  });
});

describe("replaceColorToken", () => {
  const oldRed = colorToken("--color-red", "#dc2626");
  const newBlue = colorToken("--color-blue", "#2563eb");

  it("replaces a bare var() reference by cssName", () => {
    expect(replaceColorToken("var(--color-red)", oldRed, newBlue)).toBe("var(--color-blue)");
  });

  it("preserves the alpha modifier inside color-mix", () => {
    const oldRed500 = colorToken("--color-red-500", "#dc2626");
    const newBlue500 = colorToken("--color-blue-500", "#2563eb");
    expect(replaceColorToken("color-mix(in srgb, var(--color-red-500) 10%, transparent)", oldRed500, newBlue500))
      .toBe("color-mix(in srgb, var(--color-blue-500) 10%, transparent)");
  });

  it("prefers the cssName identity over the human name", () => {
    const oldWithName = { ...oldRed, cssName: "--color-red-impl", name: "--color-red" };
    expect(replaceColorToken("var(--color-red-impl)", oldWithName, newBlue)).toBe("var(--color-blue)");
  });

  it("falls back to literal value replacement when the reference is absent", () => {
    expect(replaceColorToken("color: #dc2626", oldRed, newBlue)).toBe("color: #2563eb");
  });

  it("returns null when the new token has no CSS reference name", () => {
    const literalOnly = { name: "blue", value: "#2563eb", source: "x.css:1" };
    expect(replaceColorToken("var(--color-red)", oldRed, literalOnly)).toBeNull();
  });

  it("does not substitute a shorter token name inside a longer reference", () => {
    expect(replaceColorToken("color-mix(in srgb, var(--color-red-500) 10%, transparent)", oldRed, newBlue)).toBeNull();
  });

  it("returns null when neither reference nor literal matches", () => {
    expect(replaceColorToken("var(--unrelated)", oldRed, newBlue)).toBeNull();
  });
});

describe("parseBorderShorthand", () => {
  it("parses a full shorthand", () => {
    const result = parseBorderShorthand("2px solid #334455", {});
    expect(result).toMatchObject({ kind: "border", sourceProperty: "border", width: "2px", style: "solid", color: "#334455", colorTokenName: null });
  });

  it("fills omitted components with CSS initials", () => {
    expect(parseBorderShorthand("2px solid", {})).toMatchObject({ width: "2px", style: "solid", color: "currentcolor" });
    expect(parseBorderShorthand("none", {})).toMatchObject({ width: "medium", style: "none", color: "currentcolor" });
    expect(parseBorderShorthand("hidden", {})).toMatchObject({ style: "hidden" });
  });

  it("accepts any component order", () => {
    expect(parseBorderShorthand("#9b4dca double 3px", {})).toMatchObject({ width: "3px", style: "double", color: "#9b4dca" });
  });

  it("resolves a token color and reports its token name", () => {
    const result = parseBorderShorthand("1px solid var(--color-border)", buildTokenTable([colorToken("--color-border", "#334455")]));
    expect(result).toMatchObject({ width: "1px", style: "solid", color: "var(--color-border)", colorTokenName: "--color-border" });
  });

  it("rejects css-wide keywords", () => {
    for (const value of ["inherit", "initial", "unset", "revert", "revert-layer"]) {
      expect(parseBorderShorthand(value, {})).toBeNull();
    }
  });

  it("rejects ambiguous, slash, image, and multi-value forms", () => {
    expect(parseBorderShorthand("1px 2px", {})).toBeNull();
    expect(parseBorderShorthand("solid dashed", {})).toBeNull();
    expect(parseBorderShorthand("1px solid red 2px", {})).toBeNull();
    expect(parseBorderShorthand("red / 10%", {})).toBeNull();
    expect(parseBorderShorthand("linear-gradient(red, blue) 2px solid", {})).toBeNull();
    expect(parseBorderShorthand("url(a.png) solid", {})).toBeNull();
  });
});

describe("compatibility helpers", () => {
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

  it("presents tokens by grammar first and name hint second", () => {
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

  it("uses browser grammar (fallbackSupports) in jsdom where CSS.supports is absent", () => {
    const css = browserCssGrammar();
    expect(css.supports("color", "#fff")).toBe(true);
    expect(css.supports("color", "var(--x)")).toBe(false);
    expect(css.supports("color", "8px")).toBe(false);
    expect(css.supports("margin", "8px")).toBe(true);
    expect(css.supports("border-radius", "8px")).toBe(true);
    expect(css.supports("box-shadow", "0 1px 2px #000")).toBe(true);
    // fallbackSupports accepts any `\d(px|rem|em)` for box-shadow.
    expect(css.supports("box-shadow", "8px")).toBe(true);
    expect(css.supports("font-family", "Inter")).toBe(true);
    expect(css.supports("font-family", "#fff")).toBe(false);
    expect(css.supports("font-weight", "700")).toBe(true);
    expect(css.supports("font-weight", "700px")).toBe(false);
    expect(css.supports("font-size", "1rem")).toBe(true);
    expect(css.supports("display", "block")).toBe(false);
    expect(css.supports("margin", "var(--space-4)")).toBe(false);
    expect(css.supports("color", "")).toBe(false);
  });

  it("ranks current tokens first and decides eligibility by concrete value", () => {
    const css = grammar([
      ["color", "#171717"],
      ["color", "#6b7280"],
    ]);
    const entries = [
      entry("--content-primary", "#171717"),
      entry("--content-secondary", "#6b7280"),
      entry("--color-misleading", "8px"),
    ];
    const candidates = getCompatibleTokenCandidates({
      property: "color",
      entries,
      currentToken: "--content-secondary",
      grammar: css,
    });
    expect(candidates.map((candidate) => candidate.entry.name)).toEqual([
      "--content-secondary",
      "--content-primary",
    ]);
    expect(candidates[0]?.isCurrent).toBe(true);
  });

  it("never offers an unresolved var() as a concrete candidate", () => {
    const css = grammar([["color", "var(--not-resolved)"]]);
    const candidates = getCompatibleTokenCandidates({
      property: "color",
      entries: [entry("--unknown", "var(--not-resolved)")],
      grammar: css,
    });
    expect(candidates).toEqual([]);
  });
});

describe("catalog helpers", () => {
  it("extracts an alias name only from an exact var() expression", () => {
    expect(aliasName("var(--b)")).toBe("--b");
    expect(aliasName("var( --b )")).toBe("--b");
    expect(aliasName("1px")).toBeNull();
    expect(aliasName("var(--a, fallback)")).toBeNull();
  });

  it("detects direct and transitive alias cycles", () => {
    const values = new Map([
      ["--a", "var(--b)"],
      ["--b", "var(--c)"],
      ["--c", "1px"],
    ]);
    expect(createsAliasCycle("--a", "--a", values)).toBe(true);
    expect(createsAliasCycle("--c", "--a", values)).toBe(true);
    expect(createsAliasCycle("--a", "--c", values)).toBe(false);
  });

  it("offers same-group non-cyclic aliases only", () => {
    const runtime: TokenRuntime = {
      root: document.documentElement,
      mediaMatches: () => false,
      supports: () => true,
      computedToken: () => "rgb(17, 17, 17)",
      selectorMatches: (selector) => selector === ":root",
      scopeMatches: () => true,
      layerOrder: () => undefined,
    };
    const catalog: TokenDefinition[] = [
      { cssName: "--color-a", name: "--color-a", declarations: [{ value: "#111", source: "x.css:1", important: false, context: { selector: ":root" } }] },
      { cssName: "--color-b", name: "--color-b", declarations: [{ value: "var(--color-a)", source: "x.css:2", important: false, context: { selector: ":root" } }] },
      { cssName: "--color-c", name: "--color-c", declarations: [{ value: "#222", source: "x.css:3", important: false, context: { selector: ":root" } }] },
      { cssName: "--space-2", name: "--space-2", declarations: [{ value: "8px", source: "x.css:4", important: false, context: { selector: ":root" } }] },
    ];
    const rows = buildTokenCatalogRows(catalog, document.documentElement, runtime);
    const colorA = rows.find((row) => row.definition.cssName === "--color-a")!;
    const colorB = rows.find((row) => row.definition.cssName === "--color-b")!;
    const colorC = rows.find((row) => row.definition.cssName === "--color-c")!;
    const space = rows.find((row) => row.definition.cssName === "--space-2")!;
    expect([...compatibleTokenNames(colorA, rows)]).toEqual(["--color-c"]);
    expect([...compatibleTokenNames(colorB, rows)].sort()).toEqual(["--color-a", "--color-c"]);
    expect([...compatibleTokenNames(colorC, rows)].sort()).toEqual(["--color-a", "--color-b"]);
    expect([...compatibleTokenNames(space, rows)]).toEqual([]);
  });

  it("classifies catalog tokens by value grammar then name", () => {
    expect(classifyCatalogToken("--brand", "#fff")).toBe("color");
    expect(classifyCatalogToken("--space-2", "8px")).toBe("spacing");
    expect(classifyCatalogToken("--font-body", "Inter")).toBe("typography");
    expect(classifyCatalogToken("--radius-md", "8px")).toBe("radius");
    expect(classifyCatalogToken("--shadow-raised", "0 1px 2px #000")).toBe("shadow");
  });

  it("labels contexts and splits source parts", () => {
    expect(contextLabel({ selector: ":root" })).toBe("Default");
    expect(contextLabel({})).toBe("Default");
    expect(contextLabel({ selector: ".dark" })).toBe(".dark");
    expect(contextLabel({ selector: ":root", wrappers: [{ kind: "media", params: "(width > 600px)" }] }))
      .toBe("Default · @media (width > 600px)");
    expect(contextLabel({ wrappers: [{ kind: "supports", params: "(display: grid)" }] }))
      .toBe("@supports (display: grid)");
    expect(contextLabel({ selector: ":root", wrappers: [
      { kind: "media", params: "(width > 600px)" },
      { kind: "layer", params: "theme" },
    ] })).toBe("Default · @media (width > 600px) · @layer theme");

    expect(sourceParts("file.css:12")).toEqual({ file: "file.css", line: 12 });
    expect(sourceParts("file.css")).toEqual({ file: "file.css", line: 0 });
    expect(sourceParts("/a/b.css:3")).toEqual({ file: "/a/b.css", line: 3 });
  });
});

describe("tokenSuggestions helpers (unified value semantics)", () => {
  it("classifies token names and values into the agreed groups", () => {
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

  it("returns same-group candidates and always keeps the current token", () => {
    const entries = [
      entry("--color-red", "#dc2626"),
      entry("--space-4", "16px"),
      entry("--color-blue", "#2563eb"),
    ];
    const colorOnly = getCompatibleTokenCandidates({ property: "color", entries, currentToken: null });
    // Grammar eligibility with the name-based label sort (unified ordering).
    expect(colorOnly.map((c) => c.entry.name)).toEqual(["--color-blue", "--color-red"]);

    const withCurrent = getCompatibleTokenCandidates({ property: "margin", entries, currentToken: "--color-red" });
    // The current token is always retained even when it is not eligible for the slot.
    expect(withCurrent.map((c) => c.entry.name)).toEqual(["--color-red", "--space-4"]);
  });
});

function fixtureFor(id: string): ConformanceFixture {
  const fixture = [...COLOR_CASES, ...BORDER_CASES, ...SPACING_CASES, ...TYPOGRAPHY_CASES]
    .find((candidate) => candidate.id === id);
  if (!fixture) throw new Error(`no conformance fixture ${id}`);
  return fixture;
}

function resolveFixture(id: string): { rows: ResolvedProperty[]; cleanup(): void } {
  const result = runConformanceFixture(fixtureFor(id));
  return { rows: result.properties, cleanup: result.cleanup };
}

function rowFor(rows: ResolvedProperty[], property: string): ResolvedProperty {
  const row = rows.find((candidate) => candidate.property === property);
  if (!row) throw new Error(`no row for ${property} in ${rows.map((r) => r.property).join(", ")}`);
  return row;
}

describe("ResolvedProperty field semantics consumed by the UI", () => {
  it("reports spacing provenance, resolved values, and attribution evidence", () => {
    const { rows, cleanup } = resolveFixture("spacing-alias-token");
    try {
      const top = rowFor(rows, "margin-top");
      expect(top.property).toBe("margin-top");
      expect(top.authored).toBe("var(--space-alias)");
      expect(top.declaredValue).toBe("var(--space-alias)");
      expect(top.tokenName).toBe("--space-alias");
      expect(top.tokens).toEqual([{ name: "--space-alias", origin: "project" }]);
      expect(top.resolvedValue).toBe("16px");
      expect(top.resolvedTokenValue).toBe("16px");
      expect(top.capability).toBe("box-sides");
      expect(top.sourceProperty).toBe("margin");
      expect(top.opacity).toBeUndefined();
      expect(top.modifiers).toEqual([]);
      expect(top.structure).toBeUndefined();
      expect(top.atRules).toBeUndefined();
      expect(top.diagnostic).toBeUndefined();
      expect(top.confidence).toBe("probable");
      expect(top.evidence.reason).toBe("authored declaration references a catalog token");
      expect(top.evidence.selector).toBe(".subject");
      expect(typeof top.evidence.specificity).toBe("number");
      expect(typeof top.evidence.sourceOrder).toBe("number");
    } finally {
      cleanup();
    }
  });

  it("keeps fallback and alpha modifiers explicit on color rows", () => {
    const { rows, cleanup } = resolveFixture("color-token-fallback");
    try {
      const color = rowFor(rows, "color");
      expect(color.authored).toBe("var(--color-text-secondary, #333)");
      expect(color.tokenName).toBe("--color-text-secondary");
      expect(color.tokens).toEqual([{ name: "--color-text-secondary", origin: "project" }]);
      expect(color.capability).toBe("color");
      expect(color.modifiers).toEqual([{ kind: "fallback", value: "#333" }]);
      expect(color.confidence).toBe("probable");
      // jsdom paints no computed value for an unresolved var(), so `computed`
      // stays the empty initial string; a real browser fills it from CSSOM.
      expect(color.computed).toBe("");
    } finally {
      cleanup();
    }
  });

  it("retains token-plus-alpha distinction the TokenField chip reads", () => {
    const { rows, cleanup } = resolveFixture("color-opacity-token");
    try {
      const color = rowFor(rows, "color");
      const background = rowFor(rows, "background-color");

      expect(color.tokenName).toBe("--color-primary");
      expect(color.opacity?.tokenName).toBe("--opacity-muted");
      expect(color.tokens?.map((token) => token.name)).toEqual(["--color-primary", "--opacity-muted"]);
      // TokenField: a token-backed opacity different from the primary token
      // keeps the primary token chip active.
      const tokenBackedOpacityName = color.tokenName
        && color.opacity
        && color.opacity.tokenName !== color.tokenName
        ? color.tokenName
        : null;
      expect(tokenBackedOpacityName).toBe("--color-primary");
      // TokenField attribution chip: opacity token is not double-counted.
      expect(color.tokens?.filter((token) => token.name !== color.opacity?.tokenName).map((token) => token.name))
        .toEqual(["--color-primary"]);

      // Alpha-only background: no primary color token, but the opacity token
      // is still part of `tokens`.
      expect(background.tokenName).toBeNull();
      expect(background.tokens?.map((token) => token.name)).toEqual(["--opacity-muted"]);
      expect(background.opacity).toMatchObject({ value: "35%", tokenName: "--opacity-muted", source: "rgb" });
      expect(background.modifiers).toEqual([{ kind: "alpha", value: "35%" }]);
    } finally {
      cleanup();
    }
  });

  it("projects border structure with source provenance on every longhand", () => {
    const { rows, cleanup } = resolveFixture("border-shorthand-token-color");
    try {
      const color = rowFor(rows, "border-top-color");
      const width = rowFor(rows, "border-top-width");

      expect(color.authored).toBe("1px solid var(--color-border)");
      expect(color.sourceProperty).toBe("border");
      expect(color.capability).toBe("structured");
      expect(color.structure).toMatchObject({
        kind: "border",
        sourceProperty: "border",
        width: "1px",
        style: "solid",
        color: "var(--color-border)",
        colorTokenName: "--color-border",
      });
      expect(color.tokenName).toBe("--color-border");
      expect(color.tokens).toEqual([{ name: "--color-border", origin: "project" }]);

      expect(width.tokenName).toBeNull();
      expect(width.tokens).toEqual([]);
      expect(width.structure?.width).toBe("1px");
      expect(width.capability).toBe("structured");
    } finally {
      cleanup();
    }
  });

  it("keeps non-color longhands atomic and color longhands structured", () => {
    const { rows, cleanup } = resolveFixture("border-longhands-separate");
    try {
      expect(rowFor(rows, "border-width")).toMatchObject({ capability: "atomic", tokenName: "--border-size", tokens: [{ name: "--border-size", origin: "project" }] });
      expect(rowFor(rows, "border-style")).toMatchObject({ capability: "atomic", tokenName: "--border-line" });
      expect(rowFor(rows, "border-color")).toMatchObject({ capability: "structured", tokenName: "--color-border" });
    } finally {
      cleanup();
    }
  });

  it("reports font longhand projections from the font shorthand", () => {
    const { rows, cleanup } = resolveFixture("type-font-shorthand");
    try {
      const family = rowFor(rows, "font-family");
      expect(family.sourceProperty).toBe("font");
      expect(family.authored).toBe('"Aster Display", Georgia, serif');
      expect(family.capability).toBe("composite");
      expect(rowFor(rows, "font-size")).toMatchObject({ authored: "1.25rem", capability: "atomic", sourceProperty: "font" });
      expect(rowFor(rows, "font-weight")).toMatchObject({ authored: "700", capability: "atomic" });
    } finally {
      cleanup();
    }
  });

  it("reports token-backed typography with resolved concrete values", () => {
    const { rows, cleanup } = resolveFixture("type-tokenized-longhands");
    try {
      const size = rowFor(rows, "font-size");
      expect(size.tokenName).toBe("--type-size-body");
      expect(size.tokens).toEqual([{ name: "--type-size-body", origin: "project" }]);
      expect(size.resolvedValue).toBe("1rem");
      expect(size.resolvedTokenValue).toBe("1rem");
      expect(size.capability).toBe("atomic");
      // Typography chip rule: token-backed atomic values with no alpha modifier
      // keep their token chip.
      const hasTokenChip = Boolean(size.tokenName
        && size.capability !== "raw"
        && size.capability !== "composite"
        && !size.modifiers?.some((modifier) => modifier.kind === "alpha"));
      expect(hasTokenChip).toBe(true);
    } finally {
      cleanup();
    }
  });

  it("surfaces an alias-cycle diagnostic on the attributed row", () => {
    const fixture: ConformanceFixture = {
      id: "char-cycle-diagnostic",
      css: ":root { --char-a: var(--char-b); --char-b: var(--char-a); }\n.subject { color: var(--char-a); }",
      markup: '<p class="subject" data-cid="Characterization" data-src="fixtures/char.tsx:1:1">cycle</p>',
      selected: ".subject",
      catalog: [
        { cssName: "--char-a", name: "--char-a", declarations: [{ value: "var(--char-b)", source: "cycle.css:1", important: false, context: { selector: ":root" } }] },
        { cssName: "--char-b", name: "--char-b", declarations: [{ value: "var(--char-a)", source: "cycle.css:2", important: false, context: { selector: ":root" } }] },
      ],
      expected: { catalog: [], properties: {} },
    };
    const result = runConformanceFixture(fixture);
    try {
      const color = rowFor(result.properties, "color");
      expect(color.diagnostic).toContain("--char-a");
      expect(color.diagnostic).toContain("cycle");
      expect(color.tokenName).toBe("--char-a");
      expect(color.confidence).toBe("probable");
    } finally {
      result.cleanup();
    }
  });

  it("keeps atRules provenance on the winning declaration when conditional wrappers apply", () => {
    // jsdom has no matchMedia, so @media rules throw during CSSOM collection
    // and cannot be exercised end to end here. `resolvePropertiesFromRules`
    // is the same rowsFromMatches seam the inspection uses, and retains the
    // rule's atRules stack on every produced row. The browser conformance
    // suite covers the CSSOM-collection path with real matchMedia.
    const el = document.createElement("div");
    el.className = "subject";
    document.body.appendChild(el);
    const rows = resolvePropertiesFromRules(el, [
      {
        selectorText: ".subject",
        declarations: [{ property: "color", value: "var(--color-primary)" }],
        specificity: 10,
        sourceOrder: 0,
        active: true,
        atRules: [{ kind: "media", params: "(min-width: 600px)" }],
      },
    ], buildTokenTable([colorToken("--color-primary", "#2563eb")]));
    try {
      const color = rowFor(rows, "color");
      expect(color.tokenName).toBe("--color-primary");
      expect(color.atRules).toEqual([{ kind: "media", params: "(min-width: 600px)" }]);
    } finally {
      el.remove();
    }
  });
});
