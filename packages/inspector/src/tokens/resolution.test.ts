// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildTokenTable,
  resolveTokenValue,
  resolvePropertiesFromRules,
  type MatchedRule,
  type TokenTable,
} from "./resolution.ts";
import type { TokenEntry } from "virtual:design-tokens";

function makeTable(entries: TokenEntry[]): TokenTable {
  return buildTokenTable(entries);
}

describe("buildTokenTable", () => {
  it("indexes entries by name", () => {
    const table = makeTable([
      { name: "--color-surface-raised", value: "#ffffff", source: "styles.css:2" },
      { name: "--space-1", value: "4px", source: "styles.css:6" },
      { name: "--space-2", value: "8px", source: "styles.css:7" },
    ]);
    expect(Object.keys(table)).toHaveLength(3);
    expect(table["--color-surface-raised"]?.value).toBe("#ffffff");
    expect(table["--space-1"]?.value).toBe("4px");
  });
});

describe("resolveTokenValue", () => {
  it("resolves a known token to its leaf value", () => {
    const table = makeTable([
      { name: "--color-surface-raised", value: "#ffffff", source: "s:1" },
    ]);
    const res = resolveTokenValue("var(--color-surface-raised)", table);
    expect(res.tokenName).toBe("--color-surface-raised");
    expect(res.resolvedValue).toBe("#ffffff");
  });

  it("resolves chained aliases depth-first to the leaf", () => {
    const table = makeTable([
      { name: "--a", value: "var(--b)", source: "s:1" },
      { name: "--b", value: "red", source: "s:2" },
    ]);
    const res = resolveTokenValue("var(--a)", table);
    expect(res.tokenName).toBe("--a");
    expect(res.resolvedValue).toBe("red");
  });

  it("returns null tokenName and raw value for an unknown custom property", () => {
    const table = makeTable([]);
    const res = resolveTokenValue("var(--unknown)", table);
    expect(res.tokenName).toBeNull();
    expect(res.resolvedValue).toBe("var(--unknown)");
  });

  it("returns null tokenName and the value itself for a hardcoded value", () => {
    const table = makeTable([
      { name: "--space-1", value: "4px", source: "s:1" },
    ]);
    const res = resolveTokenValue("16px", table);
    expect(res.tokenName).toBeNull();
    expect(res.resolvedValue).toBe("16px");
  });

  it("marks a value with only an unknown var as not a token", () => {
    const table = makeTable([
      { name: "--space-1", value: "4px", source: "s:1" },
    ]);
    const res = resolveTokenValue("1px solid var(--color-unknown)", table);
    expect(res.tokenName).toBeNull();
    expect(res.resolvedValue).toBe("1px solid var(--color-unknown)");
  });

  it("picks the first known token ref when several vars are present", () => {
    const table = makeTable([
      { name: "--space-1", value: "4px", source: "s:1" },
      { name: "--space-2", value: "8px", source: "s:2" },
    ]);
    const res = resolveTokenValue("var(--space-1) var(--space-2)", table);
    expect(res.tokenName).toBe("--space-1");
    expect(res.resolvedValue).toBe("4px");
  });

  it("terminates on circular aliases", () => {
    const table = makeTable([
      { name: "--a", value: "var(--b)", source: "s:1" },
      { name: "--b", value: "var(--a)", source: "s:2" },
    ]);
    const res = resolveTokenValue("var(--a)", table);
    expect(res.tokenName).toBe("--a");
    expect(typeof res.resolvedValue).toBe("string");
  });
});

describe("resolvePropertiesFromRules", () => {
  let btn: HTMLButtonElement;

  beforeEach(() => {
    document.body.innerHTML = "";
    btn = document.createElement("button");
    btn.className = "btn";
    document.body.appendChild(btn);
  });

  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("collects var() declarations, resolving tokens vs hardcoded values", () => {
    const table = makeTable([
      { name: "--color-surface-raised", value: "#ffffff", source: "s:2" },
      { name: "--color-text-secondary", value: "#666666", source: "s:5" },
      { name: "--space-1", value: "4px", source: "s:6" },
      { name: "--space-2", value: "8px", source: "s:7" },
    ]);
    const rules: MatchedRule[] = [
      {
        selectorText: ".btn",
        declarations: [
          { property: "padding", value: "var(--space-1) var(--space-2)" },
          { property: "background", value: "var(--color-surface-raised)" },
          { property: "border", value: "1px solid var(--color-text-secondary)" },
          { property: "border-radius", value: "var(--space-1)" },
          { property: "cursor", value: "pointer" },
        ],
      },
      {
        selectorText: ":root",
        declarations: [{ property: "--space-1", value: "4px" }],
      },
    ];

    const result = resolvePropertiesFromRules(btn, rules, table);
    const byProp = new Map(result.map((r) => [r.property, r]));

    expect(result).toHaveLength(5);
    expect(byProp.get("background")?.tokenName).toBe("--color-surface-raised");
    expect(byProp.get("background")?.declaredValue).toBe("var(--color-surface-raised)");
    expect(byProp.get("background")?.resolvedValue).toBe("#ffffff");

    expect(byProp.get("border-radius")?.tokenName).toBe("--space-1");
    expect(byProp.get("border-radius")?.resolvedValue).toBe("4px");

    expect(byProp.get("cursor")?.tokenName).toBeNull();
    expect(byProp.get("cursor")?.resolvedValue).toBe("pointer");

    expect(result.some((r) => r.property === "--space-1")).toBe(false);
  });

  it("skips rules whose selector does not match", () => {
    const table = makeTable([
      { name: "--color-surface-raised", value: "#ffffff", source: "s:2" },
    ]);
    const rules: MatchedRule[] = [
      {
        selectorText: ".other",
        declarations: [{ property: "background", value: "var(--color-surface-raised)" }],
      },
    ];
    expect(resolvePropertiesFromRules(btn, rules, table)).toEqual([]);
  });

  it("later matching rule wins for the same property", () => {
    const table = makeTable([
      { name: "--space-1", value: "4px", source: "s:6" },
      { name: "--space-2", value: "8px", source: "s:7" },
    ]);
    const rules: MatchedRule[] = [
      {
        selectorText: ".btn",
        declarations: [{ property: "padding", value: "var(--space-1)" }],
      },
      {
        selectorText: "button.btn",
        declarations: [{ property: "padding", value: "var(--space-2)" }],
      },
    ];
    const result = resolvePropertiesFromRules(btn, rules, table);
    expect(result).toHaveLength(1);
    expect(result[0]!.tokenName).toBe("--space-2");
    expect(result[0]!.resolvedValue).toBe("8px");
  });

  it("caps the result to the maximum number of properties", () => {
    const table = makeTable([{ name: "--space-1", value: "4px", source: "s:6" }]);
    const declarations = Array.from({ length: 120 }, (_, i) => ({
      property: `--x${i}`,
      value: `var(--space-1)`,
    }));
    const rules: MatchedRule[] = [{ selectorText: ".btn", declarations }];
    const result = resolvePropertiesFromRules(btn, rules, table);
    expect(result.length).toBeLessThanOrEqual(100);
  });
});