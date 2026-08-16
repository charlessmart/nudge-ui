// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { BorderEditor } from "./BorderEditor.tsx";
import { BorderRadiusEditor } from "./BorderRadiusEditor.tsx";
import { BoxShadowEditor } from "./BoxShadowEditor.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "@design-tool/css/model";
import {
  makeSelected,
  mount,
  setInputValue,
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

  function selectBorderStyle(style: string): void {
    act(() => (handle.host.querySelector('[data-test="border-style-settings"]') as HTMLButtonElement).click());
    act(() => (document.body.querySelector(`[data-test="border-style-setting-${style}"]`) as HTMLElement).click());
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

  it("changes border-style via the settings picker", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderEditor, { element: selected, entries: ENTRIES }));
    expect(handle.host.querySelector('[data-test="border-style-settings"]')?.getAttribute("data-current-style")).toBe("solid");
    expect(handle.host.querySelector('[data-test="border-style-settings"] svg')?.classList.contains("tabler-icon-border-style-2")).toBe(true);
    selectBorderStyle("dashed");
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

    expect(handle.host.querySelector('[data-test="add-border"]')?.classList.contains("dt-icon-button--quiet")).toBe(true);
    expect(handle.host.querySelector('[data-test="border-style-settings"]')).toBeNull();
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

    expect(handle.host.querySelector('[data-test="add-border"]')?.classList.contains("dt-icon-button--quiet")).toBe(true);
    expect(handle.host.querySelector('[data-test="border-style-settings"]')).toBeNull();
  });

  it("hides default solid style declarations when every border width is zero", () => {
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
    });
    const row = (property: string, authored: string, resolvedValue: string): ResolvedProperty => ({
      property,
      tokenName: null,
      declaredValue: authored,
      authored,
      resolvedValue,
      capability: "raw",
      confidence: "unknown",
      evidence: { reason: "matched default style" },
    });
    handle = mount(createElement(BorderEditor, {
      element: selected,
      entries: ENTRIES,
      tokenRows: [
        row("border-style", "solid", "solid"),
        row("border-width", "0", "0px"),
      ],
    }));

    expect(handle.host.querySelector('[data-test="add-border"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="border-style-settings"]')).toBeNull();
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

  it("shows the remove button when a border is present", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderEditor, { element: selected, entries: ENTRIES }));
    expect(handle.host.querySelector('[data-test="remove-border"]')?.classList.contains("dt-icon-button--quiet")).toBe(true);
  });

  it("removes the border when the remove button is clicked", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderEditor, { element: selected, entries: ENTRIES }));
    act(() => (handle.host.querySelector('[data-test="remove-border"]') as HTMLButtonElement).click());
    expect(sheetText()).toContain("border: 0 solid;");
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
    expect(handle.host.querySelector('[data-test="border-style-settings"]')).not.toBeNull();
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
    expect(handle.host.querySelector('[data-test="border-style-settings"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-width"]')).toBeNull();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-color"]')).toBeNull();

    selectBorderStyle("solid");
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

    expect(handle.host.querySelector('.dt-border')?.getAttribute("data-expanded")).toBe("true");
    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-top-width"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-left-width"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="border-style-right"]')).not.toBeNull();
  });

  it("writes border-radius via the raw input", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderRadiusEditor, { element: selected, entries: ENTRIES }));
    const tokenField = handle.host.querySelector('[data-test="token-field"][data-property="border-radius"]');
    const raw = tokenField!.querySelector('[data-test="raw-input"]') as HTMLInputElement;
    setInputValue(raw, "12px");
    expect(sheetText()).toContain("border-radius: 12px;");
  });

  it("starts linked and reveals per-corner fields on expand", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderRadiusEditor, { element: selected, entries: ENTRIES }));
    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-radius"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-top-left-radius"]')).toBeNull();

    act(() => {
      (handle.host.querySelector('[data-test="border-radius-expand"]') as HTMLButtonElement).click();
    });

    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-radius"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-top-left-radius"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-top-right-radius"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-bottom-right-radius"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-bottom-left-radius"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-side="top"] svg')?.classList.contains("tabler-icon-radius-top-left")).toBe(true);
    expect(handle.host.querySelector('[data-side="right"] svg')?.classList.contains("tabler-icon-radius-top-right")).toBe(true);
    expect(handle.host.querySelector('[data-side="bottom"] svg')?.classList.contains("tabler-icon-radius-bottom-right")).toBe(true);
    expect(handle.host.querySelector('[data-side="left"] svg')?.classList.contains("tabler-icon-radius-bottom-left")).toBe(true);
  });

  it("shows Mix in the grouped field when corner values differ", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    const radiusValues = [
      ["border-top-left-radius", "4px"],
      ["border-top-right-radius", "8px"],
      ["border-bottom-right-radius", "12px"],
      ["border-bottom-left-radius", "16px"],
    ] as const;
    const radiusRows: ResolvedProperty[] = radiusValues.map(([property, value]) => ({
      property,
      tokenName: null,
      declaredValue: value,
      authored: value,
      resolvedValue: value,
      capability: "atomic",
      confidence: "unknown",
      evidence: { reason: "test fixture" },
    }));
    handle = mount(createElement(BorderRadiusEditor, { element: selected, entries: ENTRIES, tokenRows: radiusRows }));

    const groupedInput = handle.host.querySelector('[data-test="token-field"][data-property="border-radius"] [data-test="raw-input"]') as HTMLInputElement;
    expect(groupedInput.value).toBe("Mix");
    expect(handle.host.querySelector('[data-test="border-radius-editor"]')?.getAttribute("data-expanded")).toBe("true");
    expect(handle.host.querySelectorAll('[data-test^="side-value-"]')).toHaveLength(4);
  });

  it("writes per-corner border-radius from expanded state", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderRadiusEditor, { element: selected, entries: ENTRIES }));

    act(() => {
      (handle.host.querySelector('[data-test="border-radius-expand"]') as HTMLButtonElement).click();
    });

    const tlField = handle.host.querySelector('[data-test="token-field"][data-property="border-top-left-radius"]');
    const raw = tlField!.querySelector('[data-test="raw-input"]') as HTMLInputElement;
    act(() => {
      setInputValue(raw, "16px");
    });
    expect(sheetText()).toContain("border-top-left-radius: 16px;");
  });

  it("collapses corners back to linked border-radius shorthand", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderRadiusEditor, { element: selected, entries: ENTRIES }));

    act(() => {
      (handle.host.querySelector('[data-test="border-radius-expand"]') as HTMLButtonElement).click();
    });

    act(() => {
      (handle.host.querySelector('[data-test="border-radius-collapse"]') as HTMLButtonElement).click();
    });

    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-radius"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-top-left-radius"]')).toBeNull();
  });

  it("writes box-shadow via the raw input", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BoxShadowEditor, { element: selected, entries: ENTRIES }));
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
    expect(handle.host.querySelector('.dt-border')?.getAttribute("data-expanded")).toBe("false");
    expect(handle.host.querySelector('.dt-border__linked-row')).not.toBeNull();
    act(() => (handle.host.querySelector('[data-test="border-expand"]') as HTMLButtonElement).click());
    expect(handle.host.querySelector('.dt-border')?.getAttribute("data-expanded")).toBe("true");
    expect(handle.host.querySelector('[data-test="token-field"][data-property="border-top-width"]')).not.toBeNull();
    const borderIcons = handle.host.querySelectorAll('[data-test="border-side-rows"] .dt-border__side-row > .dt-side-values__side-icon');
    expect(borderIcons).toHaveLength(4);
    expect(borderIcons[0]?.classList.contains("tabler-icon-border-top")).toBe(true);
    expect(borderIcons[1]?.classList.contains("tabler-icon-border-right")).toBe(true);
    expect(borderIcons[2]?.classList.contains("tabler-icon-border-bottom")).toBe(true);
    expect(borderIcons[3]?.classList.contains("tabler-icon-border-left")).toBe(true);
    expect(handle.host.querySelector('[data-test="border-side-rows"] [data-side="top"] [data-test="token-field"][data-property="border-top-color"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="border-side-rows"] [data-side="top"] [data-test="token-field"][data-property="border-top-width"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="border-side-rows"] [data-side="top"] [data-test="border-style-top"]')).not.toBeNull();
  });

  it("writes a focused border color side without changing the linked shorthand", () => {
    const { selected } = makeSelected();
    mockComputedStyle(defaultComputed());
    handle = mount(createElement(BorderEditor, { element: selected, entries: ENTRIES }));
    act(() => (handle.host.querySelector('[data-test="border-expand"]') as HTMLButtonElement).click());
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

    expect(handle.host.querySelector('.dt-border')?.getAttribute("data-expanded")).toBe("true");
    act(() => (handle.host.querySelector('[data-test="border-collapse"]') as HTMLButtonElement).click());
    expect(handle.host.querySelector('.dt-border')?.getAttribute("data-expanded")).toBe("false");

    expect(sheetText()).toContain("border-width: 2px;");
    expect(sheetText()).toContain("border-style: dashed;");
    expect(sheetText()).toContain("border-color: rgb(18, 52, 86);");
  });
});
