// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
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
