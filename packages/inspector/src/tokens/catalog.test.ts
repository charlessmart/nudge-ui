// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { TokenDefinition } from "virtual:design-tokens";
import {
  aliasName,
  buildTokenCatalogRows,
  classifyCatalogToken,
  compatibleTokenNames,
  createsAliasCycle,
  filterTokenRows,
  type TokenRuntime,
} from "./catalog.ts";

function runtime(overrides: Partial<TokenRuntime> = {}): TokenRuntime {
  const root = document.documentElement;
  return {
    root,
    mediaMatches: () => false,
    supports: () => true,
    computedToken: () => "rgb(17, 17, 17)",
    selectorMatches: (selector) => selector === ":root",
    scopeMatches: () => true,
    ...overrides,
  };
}

const CATALOG: TokenDefinition[] = [
  {
    cssName: "--color-text",
    name: "--color-text",
    declarations: [
      { value: "#111", source: "src/theme.css:2", important: false, context: { selector: ":root" } },
      { value: "#eee", source: "src/theme.css:6", important: false, context: { selector: ':root[data-theme="dark"]' } },
    ],
  },
  {
    cssName: "--space-2",
    name: "--space-2",
    declarations: [{ value: "8px", source: "src/theme.css:3", important: false, context: { selector: ":root" } }],
  },
];

describe("token catalog", () => {
  it("selects only the declaration active in the host context", () => {
    const rows = buildTokenCatalogRows(CATALOG, document.documentElement, runtime());
    expect(rows[0]?.authoredValue).toBe("#111");
    expect(rows[0]?.contextLabel).toBe("Default");

    const dark = buildTokenCatalogRows(CATALOG, document.documentElement, runtime({
      selectorMatches: (selector) => selector === ":root" || selector.includes("dark"),
    }));
    expect(dark[0]?.authoredValue).toBe("#eee");
    expect(dark[0]?.contextLabel).toContain("dark");
  });

  it("keeps a token visible but inactive when no declaration applies", () => {
    const onlyDark: TokenDefinition[] = [{
      cssName: "--dark-only",
      name: "--dark-only",
      declarations: [{ value: "#000", source: "x.css:1", important: false, context: { selector: ".dark" } }],
    }];
    const [row] = buildTokenCatalogRows(onlyDark, document.documentElement, runtime());
    expect(row?.activeDeclaration).toBeNull();
    expect(row?.contextLabel).toBe("Inactive in current theme");
  });

  it("filters by name and any authored variant value", () => {
    const rows = buildTokenCatalogRows(CATALOG, document.documentElement, runtime());
    expect(filterTokenRows(rows, "space")).toHaveLength(1);
    expect(filterTokenRows(rows, "#eee")).toHaveLength(1);
  });

  it("classifies the agreed groups", () => {
    expect(classifyCatalogToken("--brand", "#fff")).toBe("color");
    expect(classifyCatalogToken("--space-2", "8px")).toBe("spacing");
    expect(classifyCatalogToken("--font-body", "Inter")).toBe("typography");
    expect(classifyCatalogToken("--radius-md", "8px")).toBe("radius");
    expect(classifyCatalogToken("--shadow-raised", "0 1px 2px #000")).toBe("shadow");
  });

  it("detects direct and transitive alias cycles", () => {
    const values = new Map([
      ["--a", "var(--b)"],
      ["--b", "var(--c)"],
      ["--c", "1px"],
    ]);
    expect(aliasName("var( --b )")).toBe("--b");
    expect(createsAliasCycle("--a", "--a", values)).toBe(true);
    expect(createsAliasCycle("--c", "--a", values)).toBe(true);
    expect(createsAliasCycle("--a", "--c", values)).toBe(false);
  });

  it("offers only same-group non-cyclic aliases", () => {
    const rows = buildTokenCatalogRows(CATALOG, document.documentElement, runtime());
    expect([...compatibleTokenNames(rows[0]!, rows)]).toEqual([]);
    expect([...compatibleTokenNames(rows[1]!, rows)]).toEqual([]);
  });
});
