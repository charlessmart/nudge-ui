// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TokenEntry } from "virtual:design-tokens";
import {
  getCompatibleTokenCandidates,
  presentationForToken,
} from "./compatibility.ts";
import type { CssValueGrammar } from "./compatibility.ts";

const ENTRIES: TokenEntry[] = [
  { name: "--content-primary", value: "#171717", source: "theme.css:1" },
  { name: "--content-secondary", value: "#6b7280", source: "theme.css:2" },
  { name: "--color-misleading", value: "8px", source: "theme.css:3" },
  { name: "--spacing-200", value: "8px", source: "theme.css:4" },
  { name: "--border-radius-medium", value: "8px", source: "theme.css:5" },
  { name: "--unfamiliar-shadow", value: "0 1px 2px #000", source: "theme.css:6" },
];

function grammar(accepted: ReadonlyArray<readonly [string, string]>): CssValueGrammar {
  const values = new Set(accepted.map(([property, value]) => `${property}\u0000${value}`));
  return { supports: vi.fn((property, value) => values.has(`${property}\u0000${value}`)) };
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("getCompatibleTokenCandidates", () => {
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

  it("keeps compatible dimensions with unfamiliar names and ranks the property-specific presentation first", () => {
    const css = grammar([
      ["border-radius", "8px"],
    ]);

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
});

describe("presentationForToken", () => {
  it("falls back to concrete-value presentation for unfamiliar color names", () => {
    const css = grammar([["color", "#171717"]]);
    expect(presentationForToken(ENTRIES[0]!, css).group).toBe("color");
  });
});
