// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { BorderEditor } from "./BorderEditor.tsx";
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
  { name: "--color-text-secondary", value: "#666666", source: "s:2" },
  { name: "--space-2", value: "8px", source: "s:7" },
];

describe("BorderEditor", () => {
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

  function defaultComputed(): Record<string, string> {
    return {
      "border-top-width": "1px",
      "border-top-style": "solid",
      "border-top-color": "rgb(102, 102, 102)",
      "border-radius": "4px",
      "box-shadow": "none",
    };
  }

  it("composes border shorthand from width + style + color on width change", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderEditor, { element: selected, entries: ENTRIES }));
    const width = handle.host.querySelector('[data-test="border-width"]') as HTMLInputElement;
    setInputValue(width, "2");
    expect(sheetText()).toContain('[data-cid="Button"][data-src*="src/Button.tsx"]');
    expect(sheetText()).toContain("border: 2px solid rgb(102, 102, 102);");
  });

  it("changes border-style via the style select", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderEditor, { element: selected, entries: ENTRIES }));
    const styleSelect = handle.host.querySelector('[data-test="border-style"]') as HTMLSelectElement;
    setSelectValue(styleSelect, "dashed");
    expect(sheetText()).toContain("border: 1px dashed rgb(102, 102, 102);");
  });

  it("writes border-radius as a single px value", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderEditor, { element: selected, entries: ENTRIES }));
    const radius = handle.host.querySelector('[data-test="border-radius"]') as HTMLInputElement;
    setInputValue(radius, "12");
    expect(sheetText()).toContain("border-radius: 12px;");
  });

  it("writes box-shadow raw text", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderEditor, { element: selected, entries: ENTRIES }));
    const shadow = handle.host.querySelector('[data-test="box-shadow"]') as HTMLInputElement;
    setInputValue(shadow, "0 2px 4px rgba(0,0,0,0.2)");
    expect(sheetText()).toContain("box-shadow: 0 2px 4px rgba(0,0,0,0.2);");
  });

  it("choosing a border-color token writes var(--token) in the border shorthand", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderEditor, { element: selected, entries: ENTRIES }));
    const tokenSelect = handle.host.querySelector('[data-test="border-color-token"]') as HTMLSelectElement;
    setSelectValue(tokenSelect, "--color-text-secondary");
    expect(sheetText()).toContain("border: 1px solid var(--color-text-secondary);");
  });

  it("typing a raw border-color writes the literal in the border shorthand", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderEditor, { element: selected, entries: ENTRIES }));
    const raw = handle.host.querySelector('[data-test="border-color-raw"]') as HTMLInputElement;
    setInputValue(raw, "#ff0000");
    expect(sheetText()).toContain("border: 1px solid #ff0000;");
  });
});
