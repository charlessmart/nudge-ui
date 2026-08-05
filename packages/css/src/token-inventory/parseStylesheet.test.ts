import { describe, expect, it } from "vitest";
import { MIN_THEME_TABLE_DECLARATIONS, SCOPED_THEME_TABLE_POLICY } from "./policy.ts";
import { parseStylesheetArtifact } from "./parseStylesheet.ts";
import type { StylesheetArtifact } from "./types.ts";

function artifact(content: string, id = "src/theme.css"): StylesheetArtifact {
  return { buildTool: "vite", id, stage: "authored", provenance: "project", content };
}

function parse(content: string, id = "src/theme.css") {
  return parseStylesheetArtifact(artifact(content, id));
}

describe("parseStylesheetArtifact — ordinary CSS parsing", () => {
  it("extracts :root and :host custom properties", () => {
    const result = parse(`:root {
  --color-surface-raised: #ffffff;
}
:host {
  --host-token: 2px;
}`);
    expect(result.diagnostics).toEqual([]);
    expect(result.definitions.map((definition) => definition.cssName))
      .toEqual(["--color-surface-raised", "--host-token"]);
    expect(result.definitions[0]!.declarations[0]!.source).toBe("src/theme.css:2");
    expect(result.definitions[1]!.declarations[0]!.context).toEqual({ selector: ":host" });
  });

  it("captures :root attribute and pseudo-class variants", () => {
    const result = parse(`:root[data-theme="dark"] { --dark-bg: #111; }
:host[data-theme="dark"] { --host-bg: #222; }`);
    expect(result.definitions.map((definition) => definition.cssName)).toEqual(["--dark-bg", "--host-bg"]);
  });

  it("handles comma-separated :root/:host selector lists but rejects mixed lists", () => {
    expect(parse(`:root, :root { --combo: 5px; }`).definitions).toHaveLength(1);
    expect(parse(`:root, .btn { --mixed: 5px; }`).definitions).toEqual([]);
  });

  it("extracts @theme custom properties (Tailwind v4)", () => {
    const result = parse(`@theme {
  --blue-500: #3b82f6;
}`);
    expect(result.definitions).toHaveLength(1);
    expect(result.definitions[0]!.declarations[0]!.value).toBe("#3b82f6");
  });

  it("extracts custom properties nested in @layer, @theme, and @scope", () => {
    expect(parse(`@layer theme {
  :root, :host { --color-lime-300: oklch(89.7% .196 126.665); }
}`).definitions).toHaveLength(1);

    expect(parse(`@layer theme {
  @theme { --nested: 1px; }
}`).definitions).toHaveLength(1);

    expect(parse(`@scope (.a) {
  :root { --scoped: 8px; }
}`).definitions).toHaveLength(1);
  });

  it("retains media, supports, scope and layer contexts in nesting order", () => {
    const result = parse(`@layer theme {
  @media (prefers-color-scheme: dark) {
    @supports (color: oklch(0 0 0)) {
      @scope (.app) {
        :root { --surface: oklch(0.1 0 0); }
      }
    }
  }
}`);
    const declaration = result.definitions[0]!.declarations[0]!;
    expect(declaration.context).toEqual({
      selector: ":root",
      wrappers: [
        { kind: "layer", params: "theme" },
        { kind: "media", params: "(prefers-color-scheme: dark)" },
        { kind: "supports", params: "(color: oklch(0 0 0))" },
        { kind: "scope", params: "(.app)" },
      ],
    });
  });

  it("preserves repeated and interleaved wrapper kinds in source order", () => {
    const result = parse(`@media (width > 600px) {
  @layer theme {
    @supports (color: oklch(0 0 0)) {
      @media (prefers-contrast: more) {
        @layer overrides {
          :root { --surface: oklch(0.1 0 0); }
        }
      }
    }
  }
}`);
    expect(result.definitions[0]!.declarations[0]!.context.wrappers).toEqual([
      { kind: "media", params: "(width > 600px)" },
      { kind: "layer", params: "theme" },
      { kind: "supports", params: "(color: oklch(0 0 0))" },
      { kind: "media", params: "(prefers-contrast: more)" },
      { kind: "layer", params: "overrides" },
    ]);
  });

  it("strips and flags !important and trims surrounding whitespace", () => {
    const result = parse(`:root {
  --hot: red !important;
  --pad:   12px   ;
}`);
    expect(result.definitions.find((entry) => entry.cssName === "--hot")!.declarations[0])
      .toMatchObject({ value: "red", important: true });
    expect(result.definitions.find((entry) => entry.cssName === "--pad")!.declarations[0])
      .toMatchObject({ value: "12px", important: false });
  });

  it("records correct source lines and deterministic local-order ids", () => {
    const result = parse(`/* header comment */

:root {
  --first: 1px;

  --second: 2px;
}`);
    expect(result.definitions[0]!.declarations[0]!.source).toBe("src/theme.css:4");
    expect(result.definitions[1]!.declarations[0]!.source).toBe("src/theme.css:6");
    expect(result.definitions[0]!.declarations[0]!.id).toContain("\u0000src/theme.css:4\u0000");
    expect(result.definitions[1]!.declarations[0]!.id).toContain("\u0000src/theme.css:6\u0000");
  });

  it("groups duplicate declarations within one artifact in source order with distinct ids", () => {
    const result = parse(`:root { --surface: white; }
:root[data-theme="dark"] { --surface: #111 !important; }`);
    expect(result.definitions).toHaveLength(1);
    const declarations = result.definitions[0]!.declarations;
    expect(declarations.map((declaration) => declaration.value)).toEqual(["white", "#111"]);
    expect(declarations[0]!.context).toEqual({ selector: ":root" });
    expect(declarations[1]!.context).toEqual({ selector: ':root[data-theme="dark"]' });
    expect(declarations[0]!.id).not.toBe(declarations[1]!.id);
    expect(declarations[0]!.id!.startsWith("--surface\u0000src/theme.css:1\u0000")).toBe(true);
    expect(declarations[1]!.id!.startsWith("--surface\u0000src/theme.css:2\u0000")).toBe(true);
  });

  it("preserves alias tokens literally without resolving them", () => {
    expect(parse(`:root { --x: var(--y); }`).definitions[0]!.declarations[0]!.value).toBe("var(--y)");
  });

  it("skips non-:root selectors and bare custom properties in media/supports/container/font-face", () => {
    expect(parse(`.button { --local: red; }`).definitions).toEqual([]);
    expect(parse(`@layer base {
  .button { --local: red; }
}`).definitions).toEqual([]);
    expect(parse(`@supports (display: grid) { --x: red; }`).definitions).toEqual([]);
    expect(parse(`@media screen { --x: red; }`).definitions).toEqual([]);
    expect(parse(`@container (min-width: 100px) { --x: red; }`).definitions).toEqual([]);
    expect(parse(`@font-face { --x: red; }`).definitions).toEqual([]);
  });

  it("extracts a class-scoped theme table without admitting small local component variables", () => {
    const result = parse(`.theme-light {
  --color-content-primary: #191919;
  --color-content-secondary: #666666;
  --color-surface-primary: #ffffff;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --radius-1: 4px;
  --radius-2: 8px;
}
.button { --local: red; }`);
    expect(result.definitions.map((definition) => definition.cssName))
      .toContain("--color-content-primary");
    expect(result.definitions.map((definition) => definition.cssName)).not.toContain("--local");
    expect(result.definitions.find((definition) => definition.cssName === "--color-content-primary"))
      .toMatchObject({ declarations: [{ context: { selector: ".theme-light" } }] });
  });

  it("pins the scoped-theme-table policy false-positive edge (component rule with >= threshold custom properties is admitted)", () => {
    // This documents the current trade-off in the named policy: a component
    // with many local custom properties is treated as a theme table. See
    // policy.ts (MIN_THEME_TABLE_DECLARATIONS).
    const result = parse(`.component {
  --a: 1px;
  --b: 2px;
  --c: 3px;
  --d: 4px;
  --e: 5px;
  --f: 6px;
  --g: 7px;
  --h: 8px;
}`);
    expect(result.definitions).toHaveLength(8);
  });

  it("pins the scoped-theme-table policy false-negative edge (real theme table with fewer than threshold declarations is rejected)", () => {
    // This documents the current trade-off in the named policy: a genuine
    // two-variable theme table is rejected because it is smaller than the
    // threshold. See policy.ts (MIN_THEME_TABLE_DECLARATIONS).
    const result = parse(`.theme-shell {
  --color: red;
  --space: 4px;
}`);
    expect(result.definitions).toEqual([]);
  });

  it("returns no definitions for empty CSS without a diagnostic", () => {
    expect(parse("")).toEqual({ definitions: [], diagnostics: [] });
  });

  it("returns no definitions for CSS without custom properties", () => {
    expect(parse("body { color: red; }").definitions).toEqual([]);
  });

  it("reports unbalanced CSS as a structured parse-failed diagnostic with an empty contribution", () => {
    const result = parse(`:root { --x: red;`, "src/x.css");
    expect(result.definitions).toEqual([]);
    expect(result.diagnostics).toEqual([{
      code: "stylesheet-parse-failed",
      artifact: "src/x.css",
      message: expect.stringContaining("src/x.css"),
    }]);
  });

  it("reports garbled CSS as a parse-failed diagnostic instead of throwing", () => {
    const result = parse(`###@@@!!!`, "src/g.css");
    expect(result.definitions).toEqual([]);
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0]!.code).toBe("stylesheet-parse-failed");
  });
});

describe("scoped-theme-table policy constant", () => {
  it("names the heuristic explicitly and documents both directions", () => {
    expect(MIN_THEME_TABLE_DECLARATIONS).toBe(8);
    expect(SCOPED_THEME_TABLE_POLICY).toMatchObject({
      minDeclarations: 8,
      requiresOnlyCustomProperties: true,
    });
    expect(SCOPED_THEME_TABLE_POLICY.rationale.length).toBeGreaterThan(50);
  });
});
