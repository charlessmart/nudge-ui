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

  it("uses the decomposed border component in a structured field", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      ...defaultComputed(),
      "border-width": "2px",
      "border-style": "solid",
      "border-color": "rgb(51, 68, 85)",
    });
    handle = mount(createElement(BorderEditor, {
      element: selected,
      entries: ENTRIES,
      tokenRows: [
        {
          property: "border-width",
          tokenName: null,
          declaredValue: "2px solid #334455",
          authored: "2px solid #334455",
          resolvedValue: "2px",
          capability: "structured",
          structure: {
            kind: "border",
            sourceProperty: "border",
            width: "2px",
            style: "solid",
            color: "#334455",
            colorTokenName: null,
          },
          confidence: "unknown",
          evidence: { reason: "test fixture" },
        },
      ],
    }));

    const raw = handle.host.querySelector('[data-test="token-field"][data-property="border-width"] [data-test="raw-input"]') as HTMLInputElement;
    expect(raw.value).toBe("2px");
  });

  it("changes border-style via the style select", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderEditor, { element: selected, entries: ENTRIES }));
    const styleSelect = handle.host.querySelector('[data-test="border-style"]') as HTMLElement;
    setSelectValue(styleSelect, "dashed");
    expect(sheetText()).toContain("border-style: dashed;");
  });

  it("shows an add button instead of border fields when there is no drawn border", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      ...defaultComputed(),
      "border-top-style": "none",
      "border-right-style": "none",
      "border-bottom-style": "none",
      "border-left-style": "none",
      "border-style": "none",
      "border-top-width": "0px",
      "border-right-width": "0px",
      "border-bottom-width": "0px",
      "border-left-width": "0px",
      "border-width": "0px",
    });
    handle = mount(createElement(BorderEditor, { element: selected, entries: ENTRIES, tokenRows: [] }));

    expect(handle.host.querySelector('[data-test="add-border"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="border-style"]')).toBeNull();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-width"]')).toBeNull();
  });

  it("treats Tailwind-style border: 0 solid preflight as no border", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      ...defaultComputed(),
      "border-top-style": "solid",
      "border-right-style": "solid",
      "border-bottom-style": "solid",
      "border-left-style": "solid",
      "border-style": "solid",
      "border-top-width": "0px",
      "border-right-width": "0px",
      "border-bottom-width": "0px",
      "border-left-width": "0px",
      "border-width": "0px",
      "border-top-color": "rgb(0, 0, 0)",
      "border-right-color": "rgb(0, 0, 0)",
      "border-bottom-color": "rgb(0, 0, 0)",
      "border-left-color": "rgb(0, 0, 0)",
      "border-color": "rgb(0, 0, 0)",
    });
    const structure = {
      kind: "border" as const,
      sourceProperty: "border" as const,
      width: "0",
      style: "solid",
      color: "currentcolor",
      colorTokenName: null,
    };
    handle = mount(createElement(BorderEditor, {
      element: selected,
      entries: ENTRIES,
      tokenRows: [
        {
          property: "border-width",
          tokenName: null,
          declaredValue: "0 solid",
          authored: "0 solid",
          resolvedValue: "0px",
          capability: "structured",
          structure,
          confidence: "unknown",
          evidence: { reason: "tailwind preflight", selector: "*" },
        },
        {
          property: "border-style",
          tokenName: null,
          declaredValue: "0 solid",
          authored: "0 solid",
          resolvedValue: "solid",
          capability: "structured",
          structure,
          confidence: "unknown",
          evidence: { reason: "tailwind preflight", selector: "*" },
        },
        {
          property: "border-color",
          tokenName: null,
          declaredValue: "0 solid",
          authored: "0 solid",
          resolvedValue: "currentcolor",
          capability: "structured",
          structure,
          confidence: "unknown",
          evidence: { reason: "tailwind preflight", selector: "*" },
        },
      ],
    }));

    expect(handle.host.querySelector('[data-test="add-border"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="border-style"]')).toBeNull();
  });

  it("adds a default border when the add button is clicked", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      ...defaultComputed(),
      "border-top-style": "none",
      "border-right-style": "none",
      "border-bottom-style": "none",
      "border-left-style": "none",
      "border-style": "none",
      "border-top-width": "0px",
      "border-right-width": "0px",
      "border-bottom-width": "0px",
      "border-left-width": "0px",
      "border-width": "0px",
    });
    handle = mount(createElement(BorderEditor, { element: selected, entries: ENTRIES, tokenRows: [] }));
    act(() => (handle.host.querySelector('[data-test="add-border"]') as HTMLButtonElement).click());
    expect(sheetText()).toContain("border: 1px solid;");
  });

  it("keeps border fields open after the user zeros width during an edit session", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    const structure = {
      kind: "border" as const,
      sourceProperty: "border" as const,
      width: "2px",
      style: "solid",
      color: "#334455",
      colorTokenName: null,
    };
    const drawnRows: ResolvedProperty[] = [
      {
        property: "border-width",
        tokenName: null,
        declaredValue: "2px solid #334455",
        authored: "2px solid #334455",
        resolvedValue: "2px",
        capability: "structured",
        structure,
        confidence: "unknown",
        evidence: { reason: "test fixture" },
      },
      {
        property: "border-style",
        tokenName: null,
        declaredValue: "2px solid #334455",
        authored: "2px solid #334455",
        resolvedValue: "solid",
        capability: "structured",
        structure,
        confidence: "unknown",
        evidence: { reason: "test fixture" },
      },
      {
        property: "border-color",
        tokenName: null,
        declaredValue: "2px solid #334455",
        authored: "2px solid #334455",
        resolvedValue: "#334455",
        capability: "structured",
        structure,
        confidence: "unknown",
        evidence: { reason: "test fixture" },
      },
    ];
    handle = mount(createElement(BorderEditor, {
      element: selected,
      entries: ENTRIES,
      tokenRows: drawnRows,
    }));
    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-width"]')).not.toBeNull();

    // Re-render as if cascade now reports zero width after the user edit.
    const zeroStructure = { ...structure, width: "0px" };
    mockComputedStyle({
      ...defaultComputed(),
      "border-top-width": "0px",
      "border-right-width": "0px",
      "border-bottom-width": "0px",
      "border-left-width": "0px",
      "border-width": "0px",
    });
    act(() => {
      handle.root.render(createElement(BorderEditor, {
        element: selected,
        entries: ENTRIES,
        tokenRows: drawnRows.map((row) => ({
          ...row,
          structure: zeroStructure,
          resolvedValue: row.property === "border-width" ? "0px" : row.resolvedValue,
        })),
      }));
    });

    expect(handle.host.querySelector('[data-test="add-border"]')).toBeNull();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-width"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="border-style"]')).not.toBeNull();
  });

  it("shows style for authored none borders and hides width/color until a drawn style is chosen", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      ...defaultComputed(),
      "border-top-style": "none",
      "border-right-style": "none",
      "border-bottom-style": "none",
      "border-left-style": "none",
      "border-style": "none",
      "border-top-width": "0px",
      "border-right-width": "0px",
      "border-bottom-width": "0px",
      "border-left-width": "0px",
      "border-width": "0px",
    });
    const structure = {
      kind: "border" as const,
      sourceProperty: "border" as const,
      width: "medium",
      style: "none",
      color: "currentcolor",
      colorTokenName: null,
    };
    handle = mount(createElement(BorderEditor, {
      element: selected,
      entries: ENTRIES,
      tokenRows: [
        {
          property: "border-style",
          tokenName: null,
          declaredValue: "none",
          authored: "none",
          resolvedValue: "none",
          capability: "structured",
          structure,
          confidence: "unknown",
          evidence: { reason: "test fixture" },
        },
        {
          property: "border-width",
          tokenName: null,
          declaredValue: "none",
          authored: "none",
          resolvedValue: "medium",
          capability: "structured",
          structure,
          confidence: "unknown",
          evidence: { reason: "test fixture" },
        },
        {
          property: "border-color",
          tokenName: null,
          declaredValue: "none",
          authored: "none",
          resolvedValue: "currentcolor",
          capability: "structured",
          structure,
          confidence: "unknown",
          evidence: { reason: "test fixture" },
        },
      ],
    }));

    // Authored `border: none` is still a border declaration — show style, hide width/color.
    expect(handle.host.querySelector('[data-test="add-border"]')).toBeNull();
    expect(handle.host.querySelector('[data-test="border-style"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-width"]')).toBeNull();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-color"]')).toBeNull();

    setSelectValue(handle.host.querySelector('[data-test="border-style"]') as HTMLElement, "solid");
    expect(sheetText()).toContain("border-style: solid;");
  });

  it("expands individual sides by default when side borders differ", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      ...defaultComputed(),
      "border-top-width": "1px",
      "border-right-width": "2px",
      "border-bottom-width": "3px",
      "border-left-width": "4px",
      "border-top-style": "solid",
      "border-right-style": "dotted",
      "border-bottom-style": "dashed",
      "border-left-style": "double",
      "border-top-color": "rgb(255, 0, 0)",
      "border-right-color": "rgb(0, 128, 0)",
      "border-bottom-color": "rgb(0, 0, 255)",
      "border-left-color": "rgb(0, 0, 0)",
    });
    const side = (source: "border-top" | "border-right" | "border-bottom" | "border-left", width: string, style: string, color: string, property: string): ResolvedProperty => ({
      property,
      tokenName: null,
      declaredValue: `${width} ${style} ${color}`,
      authored: `${width} ${style} ${color}`,
      resolvedValue: property.endsWith("-width") ? width : property.endsWith("-style") ? style : color,
      capability: "structured",
      structure: { kind: "border", sourceProperty: source, width, style, color, colorTokenName: null },
      confidence: "unknown",
      evidence: { reason: "test fixture" },
    });
    handle = mount(createElement(BorderEditor, {
      element: selected,
      entries: ENTRIES,
      tokenRows: [
        side("border-top", "1px", "solid", "red", "border-top-width"),
        side("border-top", "1px", "solid", "red", "border-top-style"),
        side("border-top", "1px", "solid", "red", "border-top-color"),
        side("border-right", "2px", "dotted", "green", "border-right-width"),
        side("border-right", "2px", "dotted", "green", "border-right-style"),
        side("border-right", "2px", "dotted", "green", "border-right-color"),
        side("border-bottom", "3px", "dashed", "blue", "border-bottom-width"),
        side("border-bottom", "3px", "dashed", "blue", "border-bottom-style"),
        side("border-bottom", "3px", "dashed", "blue", "border-bottom-color"),
        side("border-left", "4px", "double", "black", "border-left-width"),
        side("border-left", "4px", "double", "black", "border-left-style"),
        side("border-left", "4px", "double", "black", "border-left-color"),
      ],
    }));

    expect(handle.host.querySelector('[data-test="border-sides"]')?.getAttribute("data-linked")).toBe("false");
    expect(handle.host.querySelector('[data-test="border-style-sides"]')?.getAttribute("data-linked")).toBe("false");
    expect(handle.host.querySelector('[data-test="border-color-sides"]')?.getAttribute("data-linked")).toBe("false");
    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-top-width"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-left-width"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="border-style-right"]')).not.toBeNull();
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
