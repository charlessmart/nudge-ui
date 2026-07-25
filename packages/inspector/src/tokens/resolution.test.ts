// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  buildTokenTable,
  resolveTokenValue,
  replaceColorOpacity,
  normalizeColorOpacity,
  getAvailableTokenCatalog,
  getAvailableTokenEntriesForElement,
  getResolvedProperties,
  resolvePropertiesFromRules,
  getAvailableInteractionStates,
  getResolvedPropertiesForState,
  invalidateStyleResolutionCache,
  parseBorderShorthand,
  type MatchedRule,
  type TokenTable,
} from "./resolution.ts";
import { computeSpecificity } from "./resolution/selectorSemantics.ts";
import type { TokenDefinition, TokenEntry } from "virtual:design-tokens";

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

describe("runtime token availability", () => {
  const definitions: TokenDefinition[] = [
    {
      cssName: "--color-live",
      name: "--color-live",
      declarations: [
        { value: "#224466", source: "src/styles.css:1", important: false, context: {} },
        { value: "#112233", source: "src/color-conformance.css:1", important: false, context: {} },
      ],
    },
    {
      cssName: "--color-danger",
      name: "--color-danger",
      declarations: [{ value: "#dc2626", source: "src/color-conformance.css:9", important: false, context: {} }],
    },
  ];

  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    document.documentElement.style.removeProperty("--color-live");
  });

  it("excludes catalog custom properties that are absent from the selected element cascade", () => {
    const element = document.createElement("div");
    element.style.setProperty("--color-live", "#224466");
    document.body.appendChild(element);

    expect(getAvailableTokenEntriesForElement(element, definitions)).toMatchObject([
      { name: "--color-live", value: "#224466" },
    ]);
  });

  it("keeps only declarations from stylesheets loaded by the current page", () => {
    const style = document.createElement("style");
    style.dataset.viteDevId = "/project/src/styles.css";
    document.head.appendChild(style);
    document.documentElement.style.setProperty("--color-live", "#224466");

    expect(getAvailableTokenCatalog(document.documentElement, definitions)).toEqual([
      {
        ...definitions[0],
        declarations: [definitions[0]!.declarations[0]!],
      },
    ]);
  });
});

describe("cross-document token attribution", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("reads authored token rules from a canvas iframe document", () => {
    const iframe = document.createElement("iframe");
    document.body.appendChild(iframe);
    const frameDocument = iframe.contentDocument!;
    const style = frameDocument.createElement("style");
    style.textContent = ".canvas-button { background-color: var(--color-canvas); }";
    frameDocument.head.appendChild(style);
    const button = frameDocument.createElement("button");
    button.className = "canvas-button";
    frameDocument.body.appendChild(button);

    const rows = getResolvedProperties(button, makeTable([
      { name: "--color-canvas", value: "#224466", source: "styles.css:1" },
    ]));

    expect(rows.find((row) => row.property === "background-color")).toMatchObject({
      tokenName: "--color-canvas",
      declaredValue: "var(--color-canvas)",
    });
  });
});

describe("state resolution cache", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    invalidateStyleResolutionCache();
  });

  it("reuses a selection snapshot, then refreshes after a host attribute change", async () => {
    const style = document.createElement("style");
    style.textContent = `
      .subject { color: var(--color-a); }
      .changed { color: var(--color-b); }
    `;
    document.head.appendChild(style);
    const element = document.createElement("div");
    element.className = "subject";
    document.body.appendChild(element);
    const table = makeTable([
      { name: "--color-a", value: "#112233", source: "styles.css:1" },
      { name: "--color-b", value: "#445566", source: "styles.css:2" },
    ]);

    const initial = getResolvedPropertiesForState(element, table, "base");
    expect(getResolvedPropertiesForState(element, table, "base")).toBe(initial);
    expect(initial.find((row) => row.property === "color")?.tokenName).toBe("--color-a");

    element.className = "changed";
    await new Promise((resolve) => setTimeout(resolve, 0));

    const refreshed = getResolvedPropertiesForState(element, table, "base");
    expect(refreshed).not.toBe(initial);
    expect(refreshed.find((row) => row.property === "color")?.tokenName).toBe("--color-b");
  });

  it("refreshes immediately after an explicit stylesheet invalidation", () => {
    const style = document.createElement("style");
    style.textContent = ".subject { color: var(--color-a); }";
    document.head.appendChild(style);
    const element = document.createElement("div");
    element.className = "subject";
    document.body.appendChild(element);
    const table = makeTable([{ name: "--color-a", value: "#112233", source: "styles.css:1" }]);

    const initial = getResolvedPropertiesForState(element, table, "base");
    invalidateStyleResolutionCache();

    expect(getResolvedPropertiesForState(element, table, "base")).not.toBe(initial);
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
    expect(res.opacity).toMatchObject({ value: "10%", source: "color-mix", tokenName: null });
  });

  it.each([
    ["#ff000088", "53.3333%", "hex"],
    ["#f008", "53.3333%", "hex"],
    ["rgba(0, 0, 0, 0.8)", "80%", "rgb"],
    ["rgb(0 255 0 / 25%)", "25%", "rgb"],
    ["hsla(240, 100%, 50%, 0.3)", "30%", "hsl"],
    ["hsl(240 100% 50% / 40%)", "40%", "hsl"],
  ] as const)("extracts opacity from %s", (value, opacity, source) => {
    expect(resolveTokenValue(value, makeTable([])).opacity).toMatchObject({ value: opacity, source, tokenName: null });
  });

  it("resolves a token-provided color-mix opacity without exposing the token as the UI value", () => {
    const res = resolveTokenValue(
      "color-mix(in srgb, var(--color-primary) var(--opacity-muted), transparent)",
      makeTable([
        { name: "--color-primary", value: "#2563eb", source: "s:1" },
        { name: "--opacity-muted", value: "0.35", source: "s:2" },
      ]),
    );
    expect(res.tokens.map((token) => token.name)).toEqual(["--color-primary", "--opacity-muted"]);
    expect(res.opacity).toMatchObject({ value: "35%", source: "color-mix", tokenName: "--opacity-muted" });
  });

  it("does not mistake a visible color mix target for opacity", () => {
    expect(resolveTokenValue("color-mix(in srgb, #2563eb 10%, white)", makeTable([])).opacity).toBeUndefined();
  });

  it("normalizes and rewrites supported color opacity values", () => {
    expect(normalizeColorOpacity("0.35")).toBe("35%");
    expect(replaceColorOpacity("#ff000088", "25%")).toBe("#ff000040");
    expect(replaceColorOpacity("rgba(0, 0, 0, 0.8)", "40%")).toBe("rgba(0, 0, 0, 40%)");
    expect(replaceColorOpacity("hsl(240 100% 50% / 40%)", "20%")).toBe("hsl(240 100% 50% / 20%)");
    expect(replaceColorOpacity("color-mix(in srgb, var(--color-primary) 50%, transparent)", "30%")).toBe(
      "color-mix(in srgb, var(--color-primary) 30%, transparent)",
    );
  });

  it("attributes Tailwind v3 direct RGB helpers to config tokens and opacity aliases", () => {
    const element = document.createElement("div");
    element.className = "bg-brand";
    const table = makeTable([{ name: "theme.colors.brand", cssName: "--tw-v3-brand", value: "#123456", source: "tailwind.config.js:1", adapter: "tailwind-v3", origin: "project" }]);
    const rows = resolvePropertiesFromRules(element, [
      { selectorText: ".bg-brand", specificity: 10000, sourceOrder: 0, declarations: [{ property: "--tw-bg-opacity", value: "0.1" }] },
      { selectorText: ".bg-brand", specificity: 10000, sourceOrder: 1, declarations: [{ property: "background-color", value: "rgb(18 52 86 / var(--tw-bg-opacity))" }] },
    ], table);
    expect(rows.find((row) => row.property === "background-color")).toMatchObject({ tokenName: "theme.colors.brand", authored: "rgb(18 52 86 / var(--tw-bg-opacity))" });
    expect(rows.find((row) => row.property === "background-color")?.modifiers).toContainEqual({ kind: "alpha", value: "10%" });
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

  it("resolves local custom-property aliases to their concrete leaf value", () => {
    const element = document.createElement("div");
    element.className = "subject";
    const rows = resolvePropertiesFromRules(element, [{
      selectorText: ".subject",
      specificity: 10000,
      sourceOrder: 0,
      declarations: [
        { property: "--color-error", value: "var(--color-danger)" },
        { property: "color", value: "var(--color-error)" },
      ],
    }], makeTable([{ name: "--color-danger", value: "#dc2626", source: "s:1" }]));

    expect(rows.find((row) => row.property === "color")).toMatchObject({
      tokenName: "--color-error",
      resolvedValue: "#dc2626",
      tokens: [{ name: "--color-error", origin: "runtime" }],
    });
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
    expect(row?.capability).toBe("atomic");
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

  it("traces inherited local custom-property tokens from an ancestor", () => {
    const style = document.createElement("style");
    style.textContent = ".wrapper { --color-ink: #1a1a2e; color: var(--color-ink); }";
    document.head.appendChild(style);

    const wrapper = document.createElement("div");
    wrapper.className = "wrapper";
    const paragraph = document.createElement("p");
    wrapper.appendChild(paragraph);
    document.body.appendChild(wrapper);

    const row = getResolvedPropertiesForState(paragraph, makeTable([]), "base")
      .find((candidate) => candidate.property === "color");

    expect(row).toMatchObject({
      tokenName: "--color-ink",
      declaredValue: "var(--color-ink)",
      evidence: { inheritedFrom: "div" },
    });
  });

  it("traces inherited hardcoded typography without replacing authored CSS with computed output", () => {
    const style = document.createElement("style");
    style.textContent = '.wrapper { font-family: "Aster Display", Georgia, serif; font-size: 1.125rem; line-height: 1.45; }';
    document.head.appendChild(style);

    const wrapper = document.createElement("div");
    wrapper.className = "wrapper";
    const paragraph = document.createElement("p");
    paragraph.textContent = "Inherited type remains attributable.";
    wrapper.appendChild(paragraph);
    document.body.appendChild(wrapper);

    const original = window.getComputedStyle.bind(window);
    const inherited = { "font-family": '"Aster Display", Georgia, serif', "font-size": "1.125rem", "line-height": "1.45" };
    (window as unknown as { getComputedStyle: typeof getComputedStyle }).getComputedStyle = ((element: Element) => {
      const base = original(element);
      return new Proxy(base, {
        get(target, key: string) {
          if (key === "getPropertyValue") return (property: string) => inherited[property as keyof typeof inherited] ?? base.getPropertyValue(property);
          return Reflect.get(target, key);
        },
      });
    }) as typeof getComputedStyle;
    try {
      const rows = getResolvedPropertiesForState(paragraph, makeTable([]), "base");
      expect(rows.find((row) => row.property === "font-size")).toMatchObject({
        authored: "1.125rem",
        evidence: { inheritedFrom: "div" },
      });
      expect(rows.find((row) => row.property === "line-height")).toMatchObject({
        authored: "1.45",
        evidence: { inheritedFrom: "div" },
      });
    } finally {
      (window as unknown as { getComputedStyle: typeof getComputedStyle }).getComputedStyle = original;
    }
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

  it("decomposes an unambiguous font shorthand while retaining font provenance", () => {
    const rows = resolvePropertiesFromRules(btn, [{
      selectorText: ".btn",
      specificity: 10000,
      declarations: [{ property: "font", value: 'italic 700 1.25rem / 1.4 "Aster Display", Georgia, serif' }],
    }], makeTable([]));

    expect(rows.find((row) => row.property === "font-size")).toMatchObject({
      authored: "1.25rem",
      sourceProperty: "font",
    });
    expect(rows.find((row) => row.property === "font-weight")).toMatchObject({
      authored: "700",
      sourceProperty: "font",
    });
    expect(rows.find((row) => row.property === "font-style")).toMatchObject({
      authored: "italic",
      sourceProperty: "font",
    });
    expect(rows.find((row) => row.property === "line-height")).toMatchObject({
      authored: "1.4",
      sourceProperty: "font",
    });
    expect(rows.find((row) => row.property === "font-family")).toMatchObject({
      authored: '"Aster Display", Georgia, serif',
      sourceProperty: "font",
    });
  });

  it("leaves system font shorthands raw instead of inventing longhands", () => {
    const rows = resolvePropertiesFromRules(btn, [{
      selectorText: ".btn",
      specificity: 10000,
      declarations: [{ property: "font", value: "menu" }],
    }], makeTable([]));

    expect(rows).toEqual([expect.objectContaining({ property: "font", authored: "menu", capability: "composite" })]);
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
    ["var(--width) dashed #9b4dca", "var(--width)", "dashed", "#9b4dca"],
    ["#9b4dca double 1px", "1px", "double", "#9b4dca"],
    ["2px solid", "2px", "solid", "currentcolor"],
    ["none", "medium", "none", "currentcolor"],
    ["hidden", "medium", "hidden", "currentcolor"],
    ["solid", "medium", "solid", "currentcolor"],
    ["2px", "2px", "none", "currentcolor"],
    ["thin dashed red", "thin", "dashed", "red"],
    ["2px solid var(--unknown)", "2px", "solid", "var(--unknown)"],
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
    expect(rows.find((row) => row.property === "border-color")?.tokenName).toBe(
      color === "var(--color-border)" ? "--color-border" : null,
    );
    expect(rows.find((row) => row.property === "border-top-width")?.authored).toBe(value);
  });

  it.each(["2px solid red / 10%", "inherit", "2px solid red url(x)"])(
    "keeps ambiguous border value %s raw",
    (value) => {
      expect(parseBorderShorthand(value, makeTable([]))).toBeNull();
      const row = resolvePropertiesFromRules(btn, [{ selectorText: ".btn", specificity: 10000, declarations: [{ property: "border", value }] }], makeTable([])).find((candidate) => candidate.property === "border");
      expect(row?.capability).toBe("raw");
      expect(row?.authored).toBe(value);
    },
  );

  it("classifies a simple calc() as atomic when variables resolve and the property is not spacing", () => {
    const value = "calc(var(--space-1) * 2)";
    const row = resolvePropertiesFromRules(btn, [{
      selectorText: ".btn",
      specificity: 10000,
      declarations: [{ property: "width", value }],
    }], makeTable([{ name: "--space-1", value: "4px", source: "s:1" }]))[0];
    expect(row).toMatchObject({ authored: value, declaredValue: value, capability: "atomic" });
    expect(row?.tokens?.map((token) => token.name)).toEqual(["--space-1"]);
  });

  it("keeps functional spacing expressions raw while preserving side attribution", () => {
    const value = "clamp(8px, var(--space-1), 24px)";
    const rows = resolvePropertiesFromRules(btn, [{
      selectorText: ".btn",
      specificity: 10000,
      declarations: [{ property: "padding", value }],
    }], makeTable([{ name: "--space-1", value: "16px", source: "s:1" }]));

    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ authored: value, capability: "raw", tokenName: "--space-1" });
    expect(rows.every((row) => row.authored === value && row.capability === "raw")).toBe(true);
  });

  it("recovers a Tailwind v4 opacity token when CSSOM has substituted its value", () => {
    btn.className = "bg-red-500/10";
    const rows = resolvePropertiesFromRules(btn, [{
      selectorText: '[class~="bg-red-500/10"]',
      specificity: 10000,
      declarations: [{ property: "background-color", value: "color-mix(in srgb, oklch(63% .2 25) 10%, transparent)" }],
    }], makeTable([{ name: "--color-red-500", value: "oklch(63% .2 25)", source: "tailwind.css:1", adapter: "tailwind-v4" }]));
    const row = rows.find((candidate) => candidate.property === "background-color");
    expect(row).toMatchObject({
      tokenName: "--color-red-500",
      authored: "color-mix(in oklab, var(--color-red-500) 10%, transparent)",
      capability: "color",
    });
    expect(row?.modifiers).toEqual([{ kind: "alpha", value: "10%" }]);
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
    expect(byProp.get("margin-top")?.sourceProperty).toBe("margin");
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

  it("projects logical spacing declarations onto physical sides above a reset", () => {
    btn.className = "btn";
    const table = makeTable([
      { name: "--space-inline", value: "16px", source: "fixture.css:1" },
      { name: "--space-block", value: "8px", source: "fixture.css:2" },
    ]);
    const rows = resolvePropertiesFromRules(btn, [
      {
        selectorText: "*",
        specificity: 0,
        layer: "base",
        sourceOrder: 0,
        declarations: [
          { property: "padding", value: "0" },
          { property: "margin", value: "0" },
        ],
      },
      {
        selectorText: ".btn",
        specificity: 10000,
        sourceOrder: 1,
        declarations: [
          { property: "padding-inline", value: "var(--space-inline)" },
          { property: "margin-block", value: "var(--space-block) 0" },
        ],
      },
    ], table);
    const byProperty = new Map(rows.map((row) => [row.property, row]));

    expect(byProperty.get("padding-left")).toMatchObject({
      authored: "var(--space-inline)",
      tokenName: "--space-inline",
      sourceProperty: "padding-inline",
    });
    expect(byProperty.get("padding-right")).toMatchObject({
      authored: "var(--space-inline)",
      tokenName: "--space-inline",
      sourceProperty: "padding-inline",
    });
    expect(byProperty.get("margin-top")).toMatchObject({
      authored: "var(--space-block)",
      tokenName: "--space-block",
      sourceProperty: "margin-block",
    });
    expect(byProperty.get("margin-bottom")).toMatchObject({
      authored: "0",
      tokenName: null,
      sourceProperty: "margin-block",
    });
  });

  it("maps logical start sides through direction and writing mode", () => {
    const table = makeTable([{ name: "--space", value: "8px", source: "fixture.css:1" }]);
    btn.style.direction = "rtl";
    let rows = resolvePropertiesFromRules(btn, [{
      selectorText: ".btn",
      specificity: 10000,
      declarations: [{ property: "padding-inline-start", value: "var(--space)" }],
    }], table);
    expect(rows.find((row) => row.property === "padding-right")).toMatchObject({ tokenName: "--space", sourceProperty: "padding-inline-start" });
    expect(rows.some((row) => row.property === "padding-left")).toBe(false);

    rows = resolvePropertiesFromRules(btn, [{
      selectorText: ".btn",
      specificity: 10000,
      declarations: [{ property: "inset-inline-start", value: "var(--space)" }],
    }], table);
    expect(rows.find((row) => row.property === "right")).toMatchObject({ tokenName: "--space", sourceProperty: "inset-inline-start" });

    btn.style.direction = "ltr";
    btn.style.writingMode = "vertical-rl";
    rows = resolvePropertiesFromRules(btn, [{
      selectorText: ".btn",
      specificity: 10000,
      declarations: [{ property: "margin-block-start", value: "var(--space)" }],
    }], table);
    expect(rows.find((row) => row.property === "margin-right")).toMatchObject({ tokenName: "--space", sourceProperty: "margin-block-start" });
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
