// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { BorderEditor } from "./BorderEditor.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "../tokens/resolution.ts";
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

const BORDER_COLOR_ROW: ResolvedProperty = {
  property: "border-color",
  tokenName: "--color-text-secondary",
  declaredValue: "var(--color-text-secondary)",
  resolvedValue: "#666666",
  confidence: "exact",
  evidence: { reason: "test fixture" },
};

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
      "border-width": "1px",
    };
  }

  it("writes border-width via the raw input", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderEditor, { element: selected, entries: ENTRIES }));
    const tokenField = handle.host.querySelector('[data-test="token-field"][data-property="border-width"]');
    const raw = tokenField!.querySelector('[data-test="raw-input"]') as HTMLInputElement;
    setInputValue(raw, "2px");
    expect(sheetText()).toContain("border-width: 2px;");
  });

  it("changes border-style via the style select", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderEditor, { element: selected, entries: ENTRIES }));
    const styleSelect = handle.host.querySelector('[data-test="border-style"]') as HTMLSelectElement;
    setSelectValue(styleSelect, "dashed");
    expect(sheetText()).toContain("border-style: dashed;");
  });

  it("writes border-radius via the raw input", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderEditor, { element: selected, entries: ENTRIES }));
    const tokenField = handle.host.querySelector('[data-test="token-field"][data-property="border-radius"]');
    const raw = tokenField!.querySelector('[data-test="raw-input"]') as HTMLInputElement;
    setInputValue(raw, "12px");
    expect(sheetText()).toContain("border-radius: 12px;");
  });

  it("writes box-shadow via the raw input", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderEditor, { element: selected, entries: ENTRIES }));
    const tokenField = handle.host.querySelector('[data-test="token-field"][data-property="box-shadow"]');
    const raw = tokenField!.querySelector('[data-test="raw-input"]') as HTMLInputElement;
    setInputValue(raw, "0 2px 4px rgba(0,0,0,0.2)");
    expect(sheetText()).toContain("box-shadow: 0 2px 4px rgba(0,0,0,0.2);");
  });

  it("pre-selects the border-color token from the resolved tokenRow", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderEditor, {
      element: selected,
      entries: ENTRIES,
      tokenRows: [BORDER_COLOR_ROW],
    }));
    const select = handle.host.querySelector('[data-test="token-select"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe("--color-text-secondary");
  });

  it("raw border-color input exists and writes to the sheet", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderEditor, { element: selected, entries: ENTRIES }));
    const tokenFields = handle.host.querySelectorAll('[data-test="token-field"]');
    const borderColorField = Array.from(tokenFields).find(
      (f) => f.getAttribute("data-property") === "border-color",
    );
    expect(borderColorField).toBeTruthy();
    const raw = borderColorField!.querySelector('[data-test="raw-input"]') as HTMLInputElement;
    expect(raw).toBeTruthy();
  });
});
