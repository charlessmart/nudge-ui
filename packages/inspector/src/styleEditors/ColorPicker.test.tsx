// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { ColorPicker } from "./ColorPicker.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import type { TokenEntry } from "virtual:design-tokens";
import {
  makeSelected,
  mount,
  setInputValue,
  setSelectValue,
  mockComputedStyle,
  restoreComputedStyle,
  sheetText,
  type MountHandle,
} from "./_testUtils.ts";

const ENTRIES: TokenEntry[] = [
  { name: "--color-text-primary", value: "#111111", source: "s:1" },
  { name: "--color-text-secondary", value: "#666666", source: "s:2" },
  { name: "--color-surface-raised", value: "#ffffff", source: "s:3" },
  { name: "--space-1", value: "4px", source: "s:6" },
];

describe("ColorPicker", () => {
  let handle: MountHandle;

  beforeEach(() => {
    resetPendingRules();
    document.getElementById("design-tool-styles")?.remove();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    handle?.unmount();
    restoreComputedStyle();
    resetPendingRules();
    document.getElementById("design-tool-styles")?.remove();
    document.body.innerHTML = "";
  });

  it("offers only color tokens in the palette dropdown", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ color: "rgb(17, 17, 17)" });
    handle = mount(createElement(ColorPicker, { element: selected, property: "color", entries: ENTRIES }));
    const select = handle.host.querySelector('[data-test="color-token-select"]') as HTMLSelectElement;
    const options = Array.from(select.querySelectorAll("option")).map((o) => o.value);
    expect(options).toContain("--color-text-primary");
    expect(options).toContain("--color-text-secondary");
    expect(options).not.toContain("--space-1");
  });

  it("choosing a token calls swapToken and writes var(--token) to the sheet", () => {
    const { el, selected } = makeSelected();
    mockComputedStyle({ color: "rgb(17, 17, 17)" });
    handle = mount(createElement(ColorPicker, { element: selected, property: "color", entries: ENTRIES }));
    const select = handle.host.querySelector('[data-test="color-token-select"]') as HTMLSelectElement;
    setSelectValue(select, "--color-text-secondary");
    expect(sheetText()).toContain('[data-cid="Button"][data-src*="src/Button.tsx"]');
    expect(sheetText()).toContain("color: var(--color-text-secondary);");
    expect(el.style.color).toBe("");
  });

  it("typing a raw hex calls setStyle and writes the literal value", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ color: "rgb(17, 17, 17)" });
    handle = mount(createElement(ColorPicker, { element: selected, property: "color", entries: ENTRIES }));
    const raw = handle.host.querySelector('[data-test="color-raw"]') as HTMLInputElement;
    setInputValue(raw, "#abcdef");
    expect(sheetText()).toContain("color: #abcdef;");
  });

  it("shows a swatch preview reflecting the selected token value", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ color: "rgb(17, 17, 17)" });
    handle = mount(createElement(ColorPicker, { element: selected, property: "color", entries: ENTRIES }));
    const select = handle.host.querySelector('[data-test="color-token-select"]') as HTMLSelectElement;
    setSelectValue(select, "--color-text-secondary");
    const swatch = handle.host.querySelector('[data-test="color-swatch"]') as HTMLElement;
    expect(swatch.style.background).toMatch(/102, 102, 102|#666666/i);
  });
});
