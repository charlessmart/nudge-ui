// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { ColorPicker, isEmptyColorValue } from "./ColorPicker.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "../tokens/resolution.ts";
import {
  makeSelected,
  mount,
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

const TOKEN_ROW: ResolvedProperty = {
  property: "color",
  tokenName: "--color-text-primary",
  declaredValue: "var(--color-text-primary)",
  resolvedValue: "#111111",
  confidence: "exact",
  evidence: { reason: "test fixture" },
};

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

  it("renders a TokenField", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ color: "rgb(17, 17, 17)" });
    handle = mount(createElement(ColorPicker, { element: selected, entries: ENTRIES }));
    const field = handle.host.querySelector('[data-test="token-field"]');
    expect(field).toBeTruthy();
    expect(field!.getAttribute("data-property")).toBe("color");
    expect(handle.host.querySelector(".dt-editor__title")?.textContent).toBe("Color");
    expect(handle.host.querySelector('[data-test="color-swatch"]')).toBeNull();
    expect(handle.host.querySelector('[data-test="color-computed"]')).toBeNull();
    expect(handle.host.querySelector('[data-test="color-picker"]')?.textContent).not.toContain("Value");
  });

  it("shows a token value in the unified color field when tokenRow is provided", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ color: "rgb(17, 17, 17)" });
    handle = mount(createElement(ColorPicker, { element: selected, entries: ENTRIES, tokenRow: TOKEN_ROW }));
    const chip = handle.host.querySelector('[data-test="token-chip"]') as HTMLButtonElement;
    expect(chip).toBeTruthy();
    expect(chip.textContent).toContain("--color-text-primary");
    expect(handle.host.querySelector('[data-test="token-field"]')?.classList.contains("dt-token-field--color")).toBe(true);
    expect((handle.host.querySelector('[data-test="color-opacity-input"]') as HTMLInputElement).value).toBe("100%");
  });

  it("shows a raw input when no tokenRow is provided", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ color: "rgb(17, 17, 17)" });
    handle = mount(createElement(ColorPicker, { element: selected, entries: ENTRIES }));
    const raw = handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;
    expect(raw).toBeTruthy();
    expect((handle.host.querySelector('[data-test="color-opacity-input"]') as HTMLInputElement).value).toBe("100%");
  });

  it("keeps an explicitly declared transparent value editable", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ color: "rgba(0, 0, 0, 0)" });
    handle = mount(createElement(ColorPicker, {
      element: selected,
      entries: ENTRIES,
      tokenRow: {
        ...TOKEN_ROW,
        tokenName: null,
        declaredValue: "transparent",
        authored: "transparent",
        resolvedValue: "rgba(0, 0, 0, 0)",
      },
    }));

    expect((handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement).value).toBe("transparent");
  });

  it("uses a readable title for the background color section", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "background-color": "rgba(0, 0, 0, 0)" });
    handle = mount(createElement(ColorPicker, {
      element: selected,
      property: "background-color",
      entries: ENTRIES,
    }));

    expect(handle.host.querySelector(".dt-editor__title")?.textContent).toBe("Background Color");
    expect(handle.host.querySelector('[data-test="color-swatch"]')).toBeNull();
    expect(handle.host.querySelector('[data-test="color-computed"]')).toBeNull();
  });

  it.each(["none", "transparent", "rgba(0, 0, 0, 0)", "rgb(0 0 0 / 0)", "#00000000"])(
    "treats %s as an empty color value",
    (value) => {
      expect(isEmptyColorValue(value)).toBe(true);
    },
  );

  it("shows an add button instead of the token field for an empty color", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "background-color": "rgba(0, 0, 0, 0)" });
    handle = mount(createElement(ColorPicker, {
      element: selected,
      property: "background-color",
      entries: ENTRIES,
    }));

    expect(handle.host.querySelector('[data-test="token-field"]')).toBeNull();
    expect(handle.host.querySelector('[data-test="add-color"]')?.classList.contains("dt-icon-button--quiet")).toBe(true);
  });

  it("reveals an empty token field after adding an empty color", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ color: "transparent" });
    handle = mount(createElement(ColorPicker, { element: selected, entries: ENTRIES }));

    act(() => {
      (handle.host.querySelector('[data-test="add-color"]') as HTMLButtonElement).click();
    });

    expect(handle.host.querySelector('[data-test="token-field"]')).toBeTruthy();
    expect((handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement).value).toBe("");
    expect(handle.host.querySelector('[data-test="remove-color"]')?.classList.contains("dt-icon-button--quiet")).toBe(true);
  });

  it("shows the remove button when a color is present", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ color: "rgb(17, 17, 17)" });
    handle = mount(createElement(ColorPicker, { element: selected, entries: ENTRIES }));
    expect(handle.host.querySelector('[data-test="remove-color"]')?.classList.contains("dt-icon-button--quiet")).toBe(true);
    expect(handle.host.querySelector('[data-test="add-color"]')).toBeNull();
  });

  it("removes the color when the remove button is clicked", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ color: "rgb(17, 17, 17)" });
    handle = mount(createElement(ColorPicker, { element: selected, entries: ENTRIES }));
    act(() => {
      (handle.host.querySelector('[data-test="remove-color"]') as HTMLButtonElement).click();
    });
    expect(sheetText()).toContain("color: transparent;");
  });

  it("shows the add button after removing the color", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ color: "rgb(17, 17, 17)" });
    handle = mount(createElement(ColorPicker, { element: selected, entries: ENTRIES }));
    act(() => {
      (handle.host.querySelector('[data-test="remove-color"]') as HTMLButtonElement).click();
    });
    mockComputedStyle({ color: "transparent" });
    act(() => {
      handle.root.render(createElement(ColorPicker, { element: selected, entries: ENTRIES }));
    });
    expect(handle.host.querySelector('[data-test="add-color"]')?.classList.contains("dt-icon-button--quiet")).toBe(true);
    expect(handle.host.querySelector('[data-test="remove-color"]')).toBeNull();
  });
});
