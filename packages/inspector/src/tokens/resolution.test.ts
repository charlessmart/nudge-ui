// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildTokenTable,
  resolveTokenValue,
  resolvePropertiesFromRules,
  getAvailableInteractionStates,
  getResolvedPropertiesForState,
  computeSpecificity,
  parseBorderShorthand,
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
  it("preserves authored fallback references and exposes modifiers", () => {
    const table = makeTable([{ name: "--space-4", value: "1rem", source: "s:1" }]);
    const res = resolveTokenValue("var(--space-4, 16px)", table);
    expect(res.tokenName).toBe("--space-4");
    expect(res.tokens).toEqual([{ name: "--space-4", origin: "project" }]);
    expect(res.modifiers).toEqual([{ kind: "fallback", value: "16px" }]);
  });

  it("keeps a Tailwind color-mix alpha as a modifier", () => {
    const table = makeTable([{ name: "--color-red-500", value: "oklch(63% .2 25)", source: "tailwind.css:1", adapter: "tailwind-v4", origin: "framework" }]);
    const res = resolveTokenValue("color-mix(in oklab, var(--color-red-500) 10%, transparent)", table);
    expect(res.tokenName).toBe("--color-red-500");
    expect(res.tokens[0]).toMatchObject({ name: "--color-red-500", origin: "framework" });
    expect(res.modifiers).toContainEqual({ kind: "alpha", value: "10%" });
  });

  it.each(["calc(var(--space-4) * 2)", "min(var(--space-4), 2rem)", "max(var(--space-4), 8px)", "clamp(8px, var(--space-4), 2rem)"])(
    "attributes a token inside %s without flattening the expression",
    (value) => {
      const res = resolveTokenValue(value, makeTable([{ name: "--space-4", value: "1rem", source: "s:1" }]));
      expect(res.tokenName).toBe("--space-4");
      expect(res.tokens[0]?.name).toBe("--space-4");
      expect(res.resolvedValue).toBe("1rem");
    },
  );
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

  it("reports the cycle without looping", () => {
    const table = makeTable([
      { name: "--a", value: "var(--b)", source: "s:1" },
      { name: "--b", value: "var(--a)", source: "s:2" },
    ]);
    expect(resolutionCycle("var(--a)", table)).toContain("--a");
  });

  it("follows Tailwind's local --tw alias to the winning global token", () => {
    const table = makeTable([
      { name: "--leading-tight", value: "1.25", source: "tailwind.css:1" },
      { name: "--text-3xl--line-height", value: "1.2", source: "tailwind.css:2" },
    ]);
    const element = document.createElement("div");
    element.className = "text-3xl leading-tight";
    const result = resolvePropertiesFromRules(element, [
      {
        selectorText: ".leading-tight",
        sourceOrder: 0,
        specificity: 10000,
        declarations: [{ property: "--tw-leading", value: "var(--leading-tight)" }],
      },
      {
        selectorText: ".text-3xl",
        sourceOrder: 1,
        specificity: 10000,
        declarations: [{ property: "line-height", value: "var(--tw-leading, var(--text-3xl--line-height))" }],
      },
    ], table);

    const row = result.find((candidate) => candidate.property === "line-height");
    expect(row?.tokenName).toBe("--leading-tight");
    expect(row?.resolvedValue).toBe("1.25");
  });
});

function resolutionCycle(value: string, table: TokenTable): string {
  return resolveTokenValue(value, table).cycle ?? "";
}

describe("interaction-state resolution", () => {
  beforeEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
  });

  it("uses the base declaration even when a hover declaration exists", () => {
    const style = document.createElement("style");
    style.textContent = ".button { background: var(--surface); } .button:hover { background: #c4f36b; }";
    document.head.appendChild(style);
    const button = document.createElement("button");
    button.className = "button";
    document.body.appendChild(button);
    const table = makeTable([{ name: "--surface", value: "#ffffff", source: "styles.css:1" }]);

    expect(getAvailableInteractionStates(button)).toEqual(["base", "hover"]);
    expect(getResolvedPropertiesForState(button, table, "base").find((row) => row.property === "background")?.resolvedValue).toBe("#ffffff");
    expect(getResolvedPropertiesForState(button, table, "hover").find((row) => row.property === "background")?.resolvedValue).toBe("#c4f36b");
  });

  it("traces inherited token-backed properties from an ancestor", () => {
    const style = document.createElement("style");
    style.textContent = ".wrapper { color: var(--color-text-primary); }";
    document.head.appendChild(style);

    const wrapper = document.createElement("div");
    wrapper.className = "wrapper";
    const heading = document.createElement("h1");
    wrapper.appendChild(heading);
    document.body.appendChild(wrapper);

    const table = makeTable([{ name: "--color-text-primary", value: "#f5f5f4", source: "tailwind.css:1" }]);
    const row = getResolvedPropertiesForState(heading, table, "base").find((candidate) => candidate.property === "color");

    expect(row).toMatchObject({
      tokenName: "--color-text-primary",
      declaredValue: "var(--color-text-primary)",
      evidence: { inheritedFrom: "div" },
    });
  });
});

describe("computeSpecificity", () => {
  it.each([
    ["*", 0],
    ["div", 100],
    [".foo", 10000],
    ["div.foo", 10100],
    ["#bar", 1000000],
    [".foo .bar", 20000],
    [".foo > .bar", 20000],
    ["div > p", 200],
    ["[data-x]", 10000],
    ["[data-x].foo", 20000],
    ["button:hover", 10100],
    ["a::before", 200],
    ["#a .b div", 1010100],
    ["a, b, c", 100],
    [".a, #b", 1000000],
    ["div :not(.foo)", 10100],
    [":is(.a, #b)", 1000000],
    [":where(.a, #b)", 0],
  ])("'%s' → %d", (selector, expected) => {
    expect(computeSpecificity(selector)).toBe(expected);
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
        specificity: 10000,
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
        specificity: 0,
        declarations: [{ property: "--space-1", value: "4px" }],
      },
    ];

    const result = resolvePropertiesFromRules(btn, rules, table);
    const byProp = new Map(result.map((r) => [r.property, r]));

    expect(result).toHaveLength(22);
    expect(byProp.get("padding-top")?.declaredValue).toBe("var(--space-1)");
    expect(byProp.get("padding-right")?.declaredValue).toBe("var(--space-2)");
    expect(byProp.get("padding-bottom")?.declaredValue).toBe("var(--space-1)");
    expect(byProp.get("padding-left")?.declaredValue).toBe("var(--space-2)");
    expect(byProp.get("background")?.tokenName).toBe("--color-surface-raised");
    expect(byProp.get("background")?.declaredValue).toBe("var(--color-surface-raised)");
    expect(byProp.get("background")?.resolvedValue).toBe("#ffffff");

    expect(byProp.get("border-radius")?.tokenName).toBe("--space-1");
    expect(byProp.get("border-radius")?.resolvedValue).toBe("4px");

    expect(byProp.get("cursor")?.tokenName).toBeNull();
    expect(byProp.get("cursor")?.resolvedValue).toBe("pointer");

    expect(result.some((r) => r.property === "--space-1")).toBe(false);
  });

  it.each([
    ["2px solid var(--color-border)", "2px", "solid", "var(--color-border)"],
    ["var(--width) dashed #123456", "var(--width)", "dashed", "#123456"],
    ["#123456 double 1px", "1px", "double", "#123456"],
  ])("decomposes safe border shorthand %s", (value, width, style, color) => {
    const table = makeTable([
      { name: "--color-border", value: "#334455", source: "s:1" },
      { name: "--width", value: "1px", source: "s:2" },
    ]);
    const structure = parseBorderShorthand(value, table);
    expect(structure).toMatchObject({ width, style, color });
    const rows = resolvePropertiesFromRules(btn, [{ selectorText: ".btn", specificity: 10000, declarations: [{ property: "border", value }] }], table);
    expect(rows.find((row) => row.property === "border-width")?.resolvedValue).toBe(width);
    expect(rows.find((row) => row.property === "border-style")?.resolvedValue).toBe(style);
    expect(rows.find((row) => row.property === "border-color")?.tokenName).toBe(color.startsWith("var") ? "--color-border" : null);
    expect(rows.find((row) => row.property === "border-top-width")?.authored).toBe(value);
  });

  it.each(["2px solid", "2px solid var(--unknown)", "2px solid red / 10%", "inherit", "2px solid red url(x)"])(
    "keeps ambiguous border value %s raw",
    (value) => {
      expect(parseBorderShorthand(value, makeTable([]))).toBeNull();
      const row = resolvePropertiesFromRules(btn, [{ selectorText: ".btn", specificity: 10000, declarations: [{ property: "border", value }] }], makeTable([])).find((candidate) => candidate.property === "border");
      expect(row?.capability).toBe("raw");
      expect(row?.authored).toBe(value);
    },
  );

  it("keeps authored expressions separate from computed and classifies them as raw", () => {
    const value = "calc(var(--space-1) * 2)";
    const row = resolvePropertiesFromRules(btn, [{
      selectorText: ".btn",
      specificity: 10000,
      declarations: [{ property: "width", value }],
    }], makeTable([{ name: "--space-1", value: "4px", source: "s:1" }]))[0];
    expect(row).toMatchObject({ authored: value, declaredValue: value, capability: "raw", computed: "" });
    expect(row?.tokens?.map((token) => token.name)).toEqual(["--space-1"]);
  });

  it.each([
    ["8px", ["8px", "8px", "8px", "8px"]],
    ["8px 16px", ["8px", "16px", "8px", "16px"]],
    ["8px 16px 24px", ["8px", "16px", "24px", "16px"]],
    ["8px 16px 24px 32px", ["8px", "16px", "24px", "32px"]],
  ] as const)("expands a %s margin shorthand into top/right/bottom/left", (value, expected) => {
    const result = resolvePropertiesFromRules(btn, [
      {
        selectorText: ".btn",
        specificity: 10000,
        declarations: [{ property: "margin", value }],
      },
    ], makeTable([]));
    const byProp = new Map(result.map((row) => [row.property, row]));

    expect(["margin-top", "margin-right", "margin-bottom", "margin-left"].map((property) => byProp.get(property)?.resolvedValue))
      .toEqual(expected);
    expect(result.some((row) => row.property === "margin")).toBe(false);
  });

  it("keeps each side's token attribution when a padding shorthand uses multiple tokens", () => {
    const result = resolvePropertiesFromRules(btn, [
      {
        selectorText: ".btn",
        specificity: 10000,
        declarations: [{ property: "padding", value: "var(--space-1) var(--space-2) var(--space-3)" }],
      },
    ], makeTable([
      { name: "--space-1", value: "4px", source: "s:1" },
      { name: "--space-2", value: "8px", source: "s:2" },
      { name: "--space-3", value: "12px", source: "s:3" },
    ]));
    const byProp = new Map(result.map((row) => [row.property, row]));

    expect(byProp.get("padding-top")?.tokenName).toBe("--space-1");
    expect(byProp.get("padding-right")?.tokenName).toBe("--space-2");
    expect(byProp.get("padding-bottom")?.tokenName).toBe("--space-3");
    expect(byProp.get("padding-left")?.tokenName).toBe("--space-2");
  });

  it("skips rules whose selector does not match", () => {
    const table = makeTable([
      { name: "--color-surface-raised", value: "#ffffff", source: "s:2" },
    ]);
    const rules: MatchedRule[] = [
      {
        selectorText: ".other",
        specificity: 10000,
        declarations: [{ property: "background", value: "var(--color-surface-raised)" }],
      },
    ];
    expect(resolvePropertiesFromRules(btn, rules, table)).toEqual([]);
  });

  it("higher specificity wins regardless of stylesheet order", () => {
    const table = makeTable([
      { name: "--space-1", value: "4px", source: "s:6" },
      { name: "--space-2", value: "8px", source: "s:7" },
    ]);
    const rules: MatchedRule[] = [
      {
        selectorText: ".btn",
        specificity: 10000,
        declarations: [{ property: "padding", value: "var(--space-1)" }],
      },
      {
        selectorText: "button.btn",
        specificity: 10100,
        declarations: [{ property: "padding", value: "var(--space-2)" }],
      },
    ];
    const result = resolvePropertiesFromRules(btn, rules, table);
    expect(result).toHaveLength(4);
    expect(result.find((row) => row.property === "padding-top")?.tokenName).toBe("--space-2");
    expect(result.find((row) => row.property === "padding-top")?.resolvedValue).toBe("8px");
  });

  it("higher specificity beats a later lower-specificity rule", () => {
    const table = makeTable([
      { name: "--space-1", value: "4px", source: "s:6" },
      { name: "--space-2", value: "8px", source: "s:7" },
    ]);
    const rules: MatchedRule[] = [
      {
        selectorText: "button.btn",
        specificity: 10100,
        declarations: [{ property: "padding", value: "var(--space-1)" }],
      },
      {
        selectorText: "*",
        specificity: 0,
        declarations: [{ property: "padding", value: "var(--space-2)" }],
      },
    ];
    // button.btn (spec 10100) beats * (spec 0) even though it comes first
    const result = resolvePropertiesFromRules(btn, rules, table);
    expect(result).toHaveLength(4);
    expect(result.find((row) => row.property === "padding-top")?.tokenName).toBe("--space-1");
    expect(result.find((row) => row.property === "padding-top")?.resolvedValue).toBe("4px");
  });

  it("caps the result to the maximum number of properties", () => {
    const table = makeTable([{ name: "--space-1", value: "4px", source: "s:6" }]);
    const declarations = Array.from({ length: 120 }, (_, i) => ({
      property: `--x${i}`,
      value: `var(--space-1)`,
    }));
    const rules: MatchedRule[] = [{ selectorText: ".btn", specificity: 10000, declarations }];
    const result = resolvePropertiesFromRules(btn, rules, table);
    expect(result.length).toBeLessThanOrEqual(100);
  });

  it("uses the specificity of the selector-list branch that actually matches", () => {
    const table = makeTable([
      { name: "--low", value: "red", source: "s:1" },
      { name: "--high", value: "blue", source: "s:2" },
    ]);
    const result = resolvePropertiesFromRules(btn, [
      { selectorText: "#never, .btn", specificity: 1_000_000, sourceOrder: 0, declarations: [{ property: "color", value: "var(--low)" }] },
      { selectorText: "button.btn", specificity: 10_100, sourceOrder: 1, declarations: [{ property: "color", value: "var(--high)" }] },
    ], table);
    expect(result[0]?.tokenName).toBe("--high");
    expect(result[0]?.evidence.selector).toBe("button.btn");
  });

  it("excludes inactive conditional candidates", () => {
    const table = makeTable([{ name: "--active", value: "red", source: "s:1" }]);
    expect(resolvePropertiesFromRules(btn, [
      { selectorText: ".btn", specificity: 10_000, active: false, declarations: [{ property: "color", value: "var(--active)" }] },
    ], table)).toEqual([]);
  });

  it("represents importance, layers and source order in candidate selection", () => {
    const table = makeTable([
      { name: "--important", value: "red", source: "s:1" },
      { name: "--later", value: "blue", source: "s:2" },
    ]);
    const result = resolvePropertiesFromRules(btn, [
      { selectorText: ".btn", specificity: 10_000, sourceOrder: 0, layer: "theme", declarations: [{ property: "color", value: "var(--important)", important: true }] },
      { selectorText: ".btn", specificity: 10_000, sourceOrder: 1, declarations: [{ property: "color", value: "var(--later)" }] },
    ], table);
    expect(result[0]?.tokenName).toBe("--important");
    expect(result[0]?.evidence).toMatchObject({ important: true, layer: "theme", sourceOrder: 0 });
  });
});
