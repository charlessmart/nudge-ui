// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import type { TokenCatalogRow } from "./catalog.ts";
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

describe("TokensPanel", () => {
  let handle: MountHandle;

  afterEach(() => {
    handle?.unmount();
    document.body.innerHTML = "";
  });

  it("exposes the complete global token name on the ellipsized row label", () => {
    const tokenName = "--color-accent-subtle";
    handle = mount(createElement(TokensPanel, { rows: [inactiveTokenRow(tokenName)] }));

    const label = handle.host.querySelector(".token-row__name") as HTMLElement;

    expect(label.tagName).toBe("CODE");
    expect(label.title).toBe(tokenName);
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
});
