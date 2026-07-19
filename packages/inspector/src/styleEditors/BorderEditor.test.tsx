// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
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
      "border-right-width": "1px",
      "border-bottom-width": "1px",
      "border-left-width": "1px",
      "border-top-style": "solid",
      "border-right-style": "solid",
      "border-bottom-style": "solid",
      "border-left-style": "solid",
      "border-top-color": "rgb(102, 102, 102)",
      "border-right-color": "rgb(102, 102, 102)",
      "border-bottom-color": "rgb(102, 102, 102)",
      "border-left-color": "rgb(102, 102, 102)",
      "border-radius": "4px",
      "box-shadow": "none",
      "border-width": "1px",
      "border-style": "solid",
      "border-color": "rgb(102, 102, 102)",
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
    const styleSelect = handle.host.querySelector('[data-test="border-style"]') as HTMLElement;
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
    const chip = handle.host.querySelector('[data-test="token-chip"]') as HTMLButtonElement;
    expect(chip).toBeTruthy();
    expect(chip.textContent).toContain("--color-text-secondary");
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

  it("starts linked and reveals side-specific border fields on demand", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderEditor, {
      element: selected,
      entries: ENTRIES,
      tokenRows: [
        { ...BORDER_COLOR_ROW, property: "border-color" },
        { ...BORDER_COLOR_ROW, property: "border-top-color" },
        { ...BORDER_COLOR_ROW, property: "border-right-color" },
        { ...BORDER_COLOR_ROW, property: "border-bottom-color" },
        { ...BORDER_COLOR_ROW, property: "border-left-color" },
      ],
    }));
    expect(handle.host.querySelector('[data-test="border-sides"]')?.getAttribute("data-linked")).toBe("true");
    const borderWidth = handle.host.querySelector('[data-test="border-sides"]') as HTMLElement;
    expect(borderWidth.querySelector(".dt-side-values__linked-row .dt-side-values__label")?.textContent).toBe("Border Width");
    expect(borderWidth.querySelector('.dt-side-values__linked-row [data-test="token-field"]')).not.toBeNull();
    expect(borderWidth.querySelector('.dt-side-values__linked-row [data-test="individual-sides"]')?.className).toContain("dt-icon-button");
    expect(borderWidth.querySelector('.dt-side-values__linked-row [data-test="individual-sides"] svg')).not.toBeNull();
    act(() => (handle.host.querySelector('[data-test="border-sides"] [data-test="individual-sides"]') as HTMLButtonElement).click());
    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-top-width"]')).not.toBeNull();
  });

  it("writes a focused border color side without changing the linked shorthand", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderEditor, { element: selected, entries: ENTRIES }));
    act(() => (handle.host.querySelector('[data-test="border-color-sides"] [data-test="individual-sides"]') as HTMLButtonElement).click());
    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-top-color"]')).not.toBeNull();
    const raw = handle.host.querySelector('[data-test="token-field"][data-property="border-top-color"] [data-test="raw-input"]') as HTMLInputElement;
    setInputValue(raw, "#123456");
    expect(sheetText()).toContain("border-top-color: #123456;");
  });

  it("links divergent border groups to their top side values", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      ...defaultComputed(),
      "border-top-width": "2px",
      "border-right-width": "4px",
      "border-bottom-width": "8px",
      "border-left-width": "1px",
      "border-top-style": "dashed",
      "border-right-style": "solid",
      "border-bottom-style": "double",
      "border-left-style": "dotted",
      "border-top-color": "rgb(18, 52, 86)",
      "border-right-color": "rgb(102, 102, 102)",
      "border-bottom-color": "rgb(18, 52, 86)",
      "border-left-color": "rgb(102, 102, 102)",
    });
    handle = mount(createElement(BorderEditor, { element: selected, entries: ENTRIES }));

    for (const testId of ["border-sides", "border-style-sides", "border-color-sides"]) {
      const group = handle.host.querySelector(`[data-test="${testId}"]`) as HTMLElement;
      expect(group.getAttribute("data-linked")).toBe("false");
      act(() => (group.querySelector('[data-test="individual-sides"]') as HTMLButtonElement).click());
      expect(group.getAttribute("data-linked")).toBe("true");
    }

    expect(sheetText()).toContain("border-width: 2px;");
    expect(sheetText()).toContain("border-style: dashed;");
    expect(sheetText()).toContain("border-color: rgb(18, 52, 86);");
  });
});
