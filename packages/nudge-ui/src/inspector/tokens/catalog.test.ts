// @vitest-environment jsdom
import { describe, expect, it, afterEach } from "vitest";
import type { TokenDefinition } from "../../css/model/index.ts";
import {
  aliasName,
  buildTokenCatalogRows,
  classifyCatalogToken,
  compatibleTokenNames,
  contextLabel,
  createsAliasCycle,
  filterTokenRows,
  humanizeSelector,
  type TokenRuntime,
} from "./catalog.ts";
import { configureNudgeUiRuntime } from "../runtime/runtimeConfig.ts";

/**
 * Configures the runtime the way the Astro host Adapter declares it in
 * `packages/nudge-ui/src/hosts/astro/astroRuntimeConfig.ts`: Astro's structural
 * scoping markers are declared at the host seam, not known to the shared
 * catalog.
 */
function configureAstroHost(): void {
  configureNudgeUiRuntime({
    projectId: "catalog-fixture",
    host: "astro",
    framework: "Astro",
    stylingSystem: "CSS custom properties",
    capabilities: {
      canvas: false,
      componentSemantics: true,
      scopingSelectorPattern: "\\[data-astro-cid-[^\\]]*\\]|\\.astro-[a-zA-Z0-9_-]+",
    },
    tokenCatalog: [],
    tokens: [],
    tokenDiagnostics: [],
    tokenGeneration: "",
    componentContracts: [],
  });
}

/** Restores a host that declares no scoping grammar. */
function configureDefaultHost(): void {
  configureNudgeUiRuntime({
    projectId: "catalog-fixture",
    host: "vite-react",
    framework: "React",
    stylingSystem: "CSS custom properties",
    capabilities: { canvas: true, componentSemantics: true },
    tokenCatalog: [],
    tokens: [],
    tokenDiagnostics: [],
    tokenGeneration: "",
    componentContracts: [],
  });
}

afterEach(configureDefaultHost);

function runtime(overrides: Partial<TokenRuntime> = {}): TokenRuntime {
  const root = document.documentElement;
  return {
    root,
    mediaMatches: () => false,
    supports: () => true,
    computedToken: () => "rgb(17, 17, 17)",
    selectorMatches: (selector) => selector === ":root",
    scopeMatches: () => true,
    layerOrder: () => undefined,
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

  it("labels Astro-scoped declarations with author vocabulary only (ADR-0011)", () => {
    configureAstroHost();
    // Astro's compiled scoped selectors carry opaque scoping hashes. The label
    // must present the author selector; the raw context stays untouched so
    // resolution still matches the rendered DOM.
    const scoped: TokenDefinition[] = [{
      cssName: "--scoped-theme",
      name: "--scoped-theme",
      declarations: [
        {
          value: "1px",
          source: "src/components/Card.astro:1",
          important: false,
          context: { selector: ".card-theme[data-astro-cid-dohjnao5]" },
        },
        {
          value: "2px",
          source: "src/components/Card.astro:1",
          important: false,
          context: { selector: ".card-theme:where(.astro-baexmxn4)" },
        },
        {
          value: "3px",
          source: "src/components/Card.astro:1",
          important: false,
          context: { selector: "h1[data-astro-cid-baexmxn4]" },
        },
      ],
    }];
    // Every labeled surface (variants list, change records, prompts) is built
    // from contextLabel, so no scoping hash reaches author-facing vocabulary.
    const labels = scoped[0]!.declarations.map((declaration) => contextLabel(declaration.context));
    expect(labels).toEqual([".card-theme", ".card-theme", "h1"]);
    expect(labels.join("\n")).not.toContain("data-astro-cid");
    expect(labels.join("\n")).not.toContain(".astro-baexmxn4");

    // The assembled catalog rows label the active declaration cleanly.
    const [row] = buildTokenCatalogRows(scoped, document.documentElement, runtime({
      selectorMatches: () => true,
    }));
    expect(row?.contextLabel).toBe(".card-theme");
    expect(row?.definition.declarations[0]?.context.selector).toBe(
      ".card-theme[data-astro-cid-dohjnao5]",
    );

    // A selector made entirely of scoping structure degrades to a structural
    // label instead of leaking an empty or hashed one.
    expect(contextLabel({ selector: ":where([data-astro-cid-x])" })).toBe("Default");

    // Resolution facts keep the raw selector.
    expect(scoped[0]!.declarations[0]!.context.selector).toBe(
      ".card-theme[data-astro-cid-dohjnao5]",
    );
  });

  it("keeps author vocabulary untouched for hosts that declare no scoping grammar", () => {
    // The default host declares no scoping markers, so an author class that
    // merely looks like Astro's reserved prefix must survive labeling —
    // scoping grammar is host-declared, never assumed by the shared catalog.
    expect(contextLabel({ selector: ".astro-brand-badge" })).toBe(".astro-brand-badge");
    expect(humanizeSelector(".card[data-astro-cid-x]", null)).toBe(".card[data-astro-cid-x]");
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

  it("requires every nested conditional wrapper and keeps the wrapper stack for previews", () => {
    const catalog: TokenDefinition[] = [{
      cssName: "--surface",
      name: "--surface",
      declarations: [{
        value: "#111",
        source: "x.css:1",
        important: false,
        context: {
          selector: ":root",
          wrappers: [
            { kind: "media", params: "(width > 600px)" },
            { kind: "layer", params: "theme" },
            { kind: "media", params: "(prefers-contrast: more)" },
          ],
        },
      }],
    }];
    const matching = buildTokenCatalogRows(catalog, document.documentElement, runtime({
      mediaMatches: (query) => query === "(width > 600px)" || query === "(prefers-contrast: more)",
    }))[0]!;
    expect(matching.activeDeclaration).not.toBeNull();
    expect(matching.styleContext).toEqual({
      wrappers: [
        { kind: "media", params: "(width > 600px)" },
        { kind: "layer", params: "theme" },
        { kind: "media", params: "(prefers-contrast: more)" },
      ],
    });

    const inactive = buildTokenCatalogRows(catalog, document.documentElement, runtime({
      mediaMatches: (query) => query === "(width > 600px)",
    }))[0]!;
    expect(inactive.activeDeclaration).toBeNull();
  });

  it("uses named layer order, including the reversed important cascade", () => {
    const catalog: TokenDefinition[] = [{
      cssName: "--surface",
      name: "--surface",
      declarations: [
        {
          value: "red",
          source: "x.css:1",
          order: 1,
          important: false,
          context: { selector: ":root", wrappers: [{ kind: "layer", params: "base" }] },
        },
        {
          value: "blue",
          source: "x.css:2",
          order: 2,
          important: false,
          context: { selector: ":root", wrappers: [{ kind: "layer", params: "theme" }] },
        },
      ],
    }];
    const layeredRuntime = runtime({
      layerOrder: (name) => ({ base: 0, theme: 1 })[name],
    });

    expect(buildTokenCatalogRows(catalog, document.documentElement, layeredRuntime)[0]?.authoredValue).toBe("blue");

    catalog[0]!.declarations.forEach((declaration) => { declaration.important = true; });
    expect(buildTokenCatalogRows(catalog, document.documentElement, layeredRuntime)[0]?.authoredValue).toBe("red");
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
