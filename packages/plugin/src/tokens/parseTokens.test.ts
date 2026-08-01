import { describe, it, expect } from "vitest";
import { parseTokenCatalog, parseTokens } from "./parseTokens";

describe("parseTokens", () => {
  it("extracts :root custom properties with name, value, source", () => {
    const css = `:root {
  --color-surface-raised: #ffffff;
  --space-1: 4px;
}`;
    const entries = parseTokens(css, "src/styles.css");
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({
      name: "--color-surface-raised",
      value: "#ffffff",
      source: "src/styles.css:2",
    });
    expect(entries[1]).toEqual({
      name: "--space-1",
      value: "4px",
      source: "src/styles.css:3",
    });
  });

  it("extracts @theme custom properties (Tailwind v4)", () => {
    const css = `@theme {
  --blue-500: #3b82f6;
}`;
    const entries = parseTokens(css, "src/theme.css");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      name: "--blue-500",
      value: "#3b82f6",
      source: "src/theme.css:2",
    });
  });

  it("extracts Tailwind theme custom properties from :root, :host", () => {
    const css = `@layer theme {
  :root, :host {
    --color-lime-300: oklch(89.7% .196 126.665);
  }
}`;
    const entries = parseTokens(css, "src/tailwind.css");
    expect(entries).toEqual([{
      name: "--color-lime-300",
      value: "oklch(89.7% .196 126.665)",
      source: "src/tailwind.css:3",
    }]);
  });

  it("extracts @layer nested :root custom properties", () => {
    const css = `@layer base {
  :root {
    --base: 1px;
  }
}`;
    const entries = parseTokens(css, "src/base.css");
    expect(entries).toHaveLength(1);
    expect(entries[0]).toEqual({
      name: "--base",
      value: "1px",
      source: "src/base.css:3",
    });
  });

  it("extracts custom properties declared directly inside @layer", () => {
    const css = `@layer base {
  --direct: 2px;
}`;
    const entries = parseTokens(css, "src/l.css");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.name).toBe("--direct");
  });

  it("extracts custom properties inside @scope", () => {
    const css = `@scope (.a) {
  :root {
    --scoped: 8px;
  }
}`;
    expect(parseTokens(css, "src/s.css")).toHaveLength(1);
  });

  it("preserves alias tokens (var(--y)) literally without resolving", () => {
    const css = `:root {
  --x: var(--y);
}`;
    const entries = parseTokens(css, "src/a.css");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.value).toBe("var(--y)");
  });

  it("strips !important from the captured value", () => {
    const css = `:root {
  --hot: red !important;
}`;
    const entries = parseTokens(css, "src/a.css");
    expect(entries).toHaveLength(1);
    expect(entries[0]!.value).toBe("red");
  });

  it("trims surrounding whitespace from the value", () => {
    const css = `:root {
  --p:   12px   ;
}`;
    const entries = parseTokens(css, "src/a.css");
    expect(entries[0]!.value).toBe("12px");
  });

  it("skips non-:root non-at-rule selectors (local vars not global tokens)", () => {
    const css = `.button {
  --local: red;
}`;
    expect(parseTokens(css, "src/b.css")).toEqual([]);
  });

  it("skips non-:root selectors even inside @layer", () => {
    const css = `@layer base {
  .button { --local: red; }
}`;
    expect(parseTokens(css, "src/b.css")).toEqual([]);
  });

  it("extracts a class-scoped theme table without admitting local component variables", () => {
    const css = `.theme-light {
  --color-content-primary: #191919;
  --color-content-secondary: #666666;
  --color-surface-primary: #ffffff;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --radius-1: 4px;
  --radius-2: 8px;
}
.button { --local: red; }`;

    const catalog = parseTokenCatalog(css, "src/theme.css");
    expect(catalog.map((definition) => definition.cssName)).toContain("--color-content-primary");
    expect(catalog.map((definition) => definition.cssName)).not.toContain("--local");
    expect(catalog.find((definition) => definition.cssName === "--color-content-primary")?.declarations[0])
      .toMatchObject({ context: { selector: ".theme-light" } });
  });

  it("records correct source line numbers for multi-line CSS", () => {
    const css = `/* header comment */

:root {
  --first: 1px;

  --second: 2px;
}
`;
    const entries = parseTokens(css, "src/m.css");
    expect(entries[0]!.source).toBe("src/m.css:4");
    expect(entries[1]!.source).toBe("src/m.css:6");
  });

  it("returns [] for unbalanced / malformed CSS without throwing", () => {
    const css = `:root { --x: red;`;
    expect(() => parseTokens(css, "src/x.css")).not.toThrow();
    expect(parseTokens(css, "src/x.css")).toEqual([]);
  });

  it("returns [] for garbled CSS", () => {
    expect(parseTokens("###@@@!!!", "src/g.css")).toEqual([]);
  });

  it("returns [] for empty CSS", () => {
    expect(parseTokens("", "src/e.css")).toEqual([]);
  });

  it("returns [] for CSS with no custom properties", () => {
    expect(parseTokens("body { color: red; }", "src/n.css")).toEqual([]);
  });

  it("handles comma-separated :root selector list", () => {
    const css = `:root, :root {
  --combo: 5px;
}`;
    expect(parseTokens(css, "src/c.css")).toHaveLength(1);
  });

  it("does not treat non-:root selector in a comma list as a token", () => {
    const css = `:root, .btn {
  --mixed: 5px;
}`;
    expect(parseTokens(css, "src/c.css")).toEqual([]);
  });

  it("captures :root attribute selector variants (e.g. :root[data-theme])", () => {
    const css = `:root[data-theme="dark"] {
  --dark-bg: #111;
}`;
    expect(parseTokens(css, "src/d.css")).toHaveLength(1);
    expect(parseTokens(css, "src/d.css")[0]!.name).toBe("--dark-bg");
  });

  it("captures :root pseudo-class variants (e.g. :root:hover)", () => {
    const css = `:root:hover {
  --hover-bg: #222;
}`;
    expect(parseTokens(css, "src/d.css")).toHaveLength(1);
  });

  it("does NOT capture custom properties inside @supports (false-positive guard)", () => {
    const css = `@supports (display: grid) {
  --x: red;
}`;
    expect(parseTokens(css, "src/s.css")).toEqual([]);
  });

  it("does NOT capture custom properties inside @media (false-positive guard)", () => {
    const css = `@media screen {
  --x: red;
}`;
    expect(parseTokens(css, "src/s.css")).toEqual([]);
  });

  it("does NOT capture custom properties inside @container", () => {
    const css = `@container (min-width: 100px) {
  --x: red;
}`;
    expect(parseTokens(css, "src/s.css")).toEqual([]);
  });

  it("does NOT capture custom properties inside @font-face", () => {
    const css = `@font-face {
  --x: red;
}`;
    expect(parseTokens(css, "src/s.css")).toEqual([]);
  });

  it("captures nested custom properties inside @theme nested in @layer", () => {
    const css = `@layer theme {
  @theme {
    --nested: 1px;
  }
}`;
    expect(parseTokens(css, "src/n.css")).toHaveLength(1);
  });
});

describe("parseTokenCatalog", () => {
  it("groups duplicate theme declarations without discarding context", () => {
    const catalog = parseTokenCatalog(`:root { --surface: white; }
:root[data-theme="dark"] { --surface: #111 !important; }`, "src/theme.css");
    expect(catalog).toHaveLength(1);
    expect(catalog[0]).toMatchObject({ cssName: "--surface", name: "--surface" });
    expect(catalog[0]?.declarations).toEqual([
      { value: "white", source: "src/theme.css:1", important: false, context: { selector: ":root" } },
      { value: "#111", source: "src/theme.css:2", important: true, context: { selector: ':root[data-theme="dark"]' } },
    ]);
  });

  it("retains media, supports, scope and layer contexts", () => {
    const css = `@layer theme {
  @media (prefers-color-scheme: dark) {
    @supports (color: oklch(0 0 0)) {
      @scope (.app) {
        :root { --surface: oklch(0.1 0 0); }
      }
    }
  }
}`;
    const declaration = parseTokenCatalog(css, "src/context.css")[0]?.declarations[0];
    expect(declaration?.context).toEqual({
      selector: ":root",
      wrappers: [
        { kind: "layer", params: "theme" },
        { kind: "media", params: "(prefers-color-scheme: dark)" },
        { kind: "supports", params: "(color: oklch(0 0 0))" },
        { kind: "scope", params: "(.app)" },
      ],
    });
  });

  it("preserves repeated and interleaved conditional wrappers in source order", () => {
    const css = `@media (width > 600px) {
  @layer theme {
    @supports (color: oklch(0 0 0)) {
      @media (prefers-contrast: more) {
        @layer overrides {
          :root { --surface: oklch(0.1 0 0); }
        }
      }
    }
  }
}`;

    expect(parseTokenCatalog(css, "src/nested-context.css")[0]?.declarations[0]?.context).toEqual({
      selector: ":root",
      wrappers: [
        { kind: "media", params: "(width > 600px)" },
        { kind: "layer", params: "theme" },
        { kind: "supports", params: "(color: oklch(0 0 0))" },
        { kind: "media", params: "(prefers-contrast: more)" },
        { kind: "layer", params: "overrides" },
      ],
    });
  });
});
