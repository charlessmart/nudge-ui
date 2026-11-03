// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import type { TokenContext } from "../../css/model/index.ts";
import type { TokenCatalogRow } from "./catalog.ts";
import { scopeRowsToStylesheet, tokenModes, tokenStylesheets } from "./catalog.ts";
import { TokensPanel } from "./TokensPanel.tsx";
import { mount, type MountHandle } from "../styleEditors/_testUtils.ts";

function inactiveTokenRow(name: string): TokenCatalogRow {
  return {
    definition: {
      cssName: name,
      name,
      declarations: [{
        value: "#334455",
        source: "src/theme.css:4",
        important: false,
        context: { selector: ":root" },
      }],
    },
    activeDeclaration: null,
    authoredValue: "",
    resolvedValue: "",
    selector: ":root",
    styleContext: {},
    contextLabel: "Inactive in current theme",
    file: "src/theme.css",
    line: 4,
    group: "color",
  };
}

function activeTokenRow(name: string, declarations: Array<{ value: string; source: string }>, winner: number): TokenCatalogRow {
  const defs = declarations.map((declaration) => ({ ...declaration, important: false, context: { selector: ":root" } }));
  const active = defs[winner]!;
  return {
    definition: { cssName: name, name, declarations: defs },
    activeDeclaration: active,
    authoredValue: active.value,
    resolvedValue: active.value,
    selector: ":root",
    styleContext: {},
    contextLabel: "Default",
    file: active.source.split(":")[0]!,
    line: Number(active.source.split(":")[1]),
    group: "color",
  };
}

describe("TokensPanel", () => {
  let handle: MountHandle;

  afterEach(() => {
    handle?.unmount();
    document.body.innerHTML = "";
  });

  it("exposes the complete global token name", () => {
    const tokenName = "--color-accent-subtle";
    handle = mount(createElement(TokensPanel, { rows: [inactiveTokenRow(tokenName)] }));

    const label = handle.host.querySelector(".token-row__name") as HTMLElement;

    expect(label.tagName).toBe("CODE");
    expect(label.textContent).toBe(tokenName);
    expect(label.querySelector(".token-label__content")?.textContent).toBe(tokenName);
  });

  it("omits token group counts", () => {
    handle = mount(createElement(TokensPanel, {
      rows: [inactiveTokenRow("--color-accent-subtle")],
    }));

    expect(handle.host.querySelector('[data-test="token-count"]')).toBeNull();
    expect(handle.host.querySelector('[data-test="token-group-count"]')).toBeNull();
    expect(handle.host.querySelector(".token-group__heading")?.textContent).toBe("Color");
  });

  it("lists one stylesheet's tokens at a time when several declare tokens", () => {
    const rows = [
      activeTokenRow("--a", [{ value: "#111111", source: "src/a.css:1" }], 0),
      activeTokenRow("--b", [{ value: "#222222", source: "src/a.css:2" }], 0),
      activeTokenRow("--border", [
        { value: "#c4c5bf", source: "src/a.css:3" },
        { value: "#334455", source: "src/b.css:9" },
      ], 1),
    ];
    expect(tokenStylesheets(rows).map(({ file, count }) => [file, count])).toEqual([["src/a.css", 3], ["src/b.css", 1]]);

    const scoped = scopeRowsToStylesheet(rows, "src/a.css");
    const border = scoped.find((row) => row.definition.cssName === "--border")!;
    expect(border.authoredValue).toBe("#c4c5bf");
    expect(border.file).toBe("src/a.css");
    expect(border.line).toBe(3);
    expect(border.definition.declarations).toHaveLength(1);
    expect(scopeRowsToStylesheet(rows, "src/b.css").map((row) => row.definition.cssName)).toEqual(["--border"]);

    handle = mount(createElement(TokensPanel, { rows }));
    expect(handle.host.querySelector('[data-test="token-stylesheet"]')).not.toBeNull();
    expect(handle.host.querySelectorAll('[data-test="global-token-row"]')).toHaveLength(3);
    expect(handle.host.querySelector('[data-test="token-variants"]')).toBeNull();
  });

  it("offers no stylesheet choice when one stylesheet declares every token", () => {
    handle = mount(createElement(TokensPanel, { rows: [inactiveTokenRow("--only")] }));

    expect(handle.host.querySelector('[data-test="token-stylesheet"]')).toBeNull();
  });

  it("lists the contexts a stylesheet declares in and scopes tokens to one", () => {
    const dark = { selector: ':root[data-theme="dark"]' };
    const themed = (name: string, light: string, night: string | null): TokenCatalogRow => {
      const row = activeTokenRow(name, [{ value: light, source: "src/a.css:1" }], 0);
      if (night === null) return row;
      const declarations = [
        ...row.definition.declarations,
        { value: night, source: "src/a.css:50", important: false, context: dark },
      ];
      return { ...row, definition: { ...row.definition, declarations } };
    };
    const rows = [themed("--surface", "#ffffff", "#17151f"), themed("--text", "#111111", "#eeeeee"), themed("--radius", "4px", null)];

    expect(tokenModes(rows, "src/a.css").map(({ key, count }) => [key, count]))
      .toEqual([["Default", 3], [':root[data-theme="dark"]', 2]]);

    const night = scopeRowsToStylesheet(rows, "src/a.css", ':root[data-theme="dark"]');
    expect(night.map((row) => row.definition.cssName)).toEqual(["--surface", "--text"]);
    expect(night[0]!.authoredValue).toBe("#17151f");
    expect(night[0]!.line).toBe(50);
    expect(night[0]!.selector).toBe(':root[data-theme="dark"]');
    expect(night[0]!.definition.declarations).toHaveLength(1);

    const day = scopeRowsToStylesheet(rows, "src/a.css", "Default");
    expect(day.map((row) => row.authoredValue)).toEqual(["#ffffff", "#111111", "4px"]);
  });

  it("folds layers and root-equivalent selectors into Default and keeps conditional contexts as modes", () => {
    const declared = (name: string, contexts: Array<[string, TokenContext]>): TokenCatalogRow => {
      const row = activeTokenRow(name, [{ value: contexts[0]![0], source: "src/a.css:1" }], 0);
      const declarations = contexts.map(([value, context], index) => ({ value, source: `src/a.css:${index + 1}`, important: false, context }));
      return { ...row, activeDeclaration: declarations[0]!, definition: { ...row.definition, declarations } };
    };
    const themeLayer: TokenContext = { selector: ":root, :host", wrappers: [{ kind: "layer", params: "theme" }] };
    const twProperties: TokenContext = {
      selector: "*, ::before, ::after, ::backdrop",
      wrappers: [{ kind: "layer", params: "properties" }, { kind: "supports", params: "(-webkit-hyphens: none)" }],
    };
    const rows = [
      declared("--color-red-500", [["oklch(63% .24 25)", themeLayer]]),
      declared("--accent", [["#f5f5f5", { selector: ":root" }], ["#222222", { selector: ".dark" }]]),
      declared("--background", [["#ffffff", { selector: "html" }], ["#000000", { selector: ".dark", wrappers: [{ kind: "layer", params: "base" }] }]]),
      declared("--space", [["8px", { selector: ":root" }], ["6px", { selector: ":root", wrappers: [{ kind: "media", params: "(max-width: 600px)" }] }]]),
      declared("--tw-border-style", [["solid", twProperties]]),
      declared("--shimmer-angle", [["20deg", { selector: ":root, :host", wrappers: twProperties.wrappers! }]]),
    ];

    expect(tokenModes(rows, "src/a.css").map(({ key, count }) => [key, count]))
      .toEqual([["Default", 6], [".dark", 2], ["@media (max-width: 600px)", 1]]);

    handle = mount(createElement(TokensPanel, { rows }));
    const names = (selector: string) => [...handle.host.querySelectorAll(`${selector} [data-test="global-token-row"]`)]
      .map((element) => element.getAttribute("data-token-name"));
    expect(names('[data-test="token-group"]')).toEqual(["--color-red-500", "--accent", "--background", "--space", "--shimmer-angle"]);
    expect(names('[data-test="token-internal"]')).toEqual(["--tw-border-style"]);
  });

  it("shows the declaration in effect when a mode declares a token twice", () => {
    const row = activeTokenRow("--color-red-500", [
      { value: "oklch(63% .24 25)", source: "src/a.css:1" },
      { value: "#ff0000", source: "src/a.css:90" },
    ], 1);
    const declarations = [
      { ...row.definition.declarations[0]!, context: { selector: ":root, :host", wrappers: [{ kind: "layer" as const, params: "theme" }] } },
      row.definition.declarations[1]!,
    ];
    const overridden = { ...row, activeDeclaration: declarations[1]!, definition: { ...row.definition, declarations } };

    const [shown] = scopeRowsToStylesheet([overridden, activeTokenRow("--x", [{ value: "1", source: "src/a.css:2" }], 0)], "src/a.css", "Default");
    expect(shown!.authoredValue).toBe("#ff0000");
    expect(shown!.line).toBe(90);
    expect(shown!.definition.declarations).toHaveLength(2);
  });

  it("offers a mode select when one stylesheet declares tokens in several contexts", () => {
    const row = activeTokenRow("--surface", [{ value: "#ffffff", source: "src/a.css:1" }], 0);
    const declarations = [
      ...row.definition.declarations,
      { value: "#17151f", source: "src/a.css:9", important: false, context: { selector: ':root[data-theme="dark"]' } },
    ];
    handle = mount(createElement(TokensPanel, { rows: [{ ...row, definition: { ...row.definition, declarations } }] }));

    expect(handle.host.querySelector('[data-test="token-stylesheet"]')).toBeNull();
    expect(handle.host.querySelector('[data-test="token-mode"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="token-variants"]')).toBeNull();
  });
});
