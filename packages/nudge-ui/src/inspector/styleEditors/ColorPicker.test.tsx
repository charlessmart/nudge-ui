// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { ColorPicker, isEmptyColorValue } from "./ColorPicker.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import type { TokenEntry } from "../../css/model/index.ts";
import type { ResolvedProperty } from "../../css/model/index.ts";
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
    document.getElementById("nudge-ui-styles")?.remove();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    handle?.unmount();
    restoreComputedStyle();
    resetPendingRules();
    document.getElementById("nudge-ui-styles")?.remove();
    document.body.innerHTML = "";
  });

  it("shows a token value in the unified color field when tokenRow is provided", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ color: "rgb(17, 17, 17)" });
    handle = mount(createElement(ColorPicker, { element: selected, entries: ENTRIES, tokenRow: TOKEN_ROW }));
    const chip = handle.host.querySelector('[data-test="token-chip"]') as HTMLButtonElement;
    expect(chip).toBeTruthy();
    expect(chip.textContent).toContain("--color-text-primary");
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

  it("keeps an explicitly declared transparent background editable", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "background-color": "rgba(0, 0, 0, 0)" });
    handle = mount(createElement(ColorPicker, {
      element: selected,
      property: "background-color",
      entries: ENTRIES,
      tokenRow: {
        ...TOKEN_ROW,
        property: "background-color",
        tokenName: null,
        declaredValue: "transparent",
        authored: "transparent",
        resolvedValue: "rgba(0, 0, 0, 0)",
      },
    }));

    expect((handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement).value).toBe("transparent");
  });

  it("keeps an authored background token available when it currently paints transparent", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "background-color": "rgba(0, 0, 0, 0)" });
    handle = mount(createElement(ColorPicker, {
      element: selected,
      property: "background-color",
      entries: ENTRIES,
      tokenRow: {
        ...TOKEN_ROW,
        property: "background",
        declaredValue: "var(--color-surface-raised)",
        authored: "var(--color-surface-raised)",
        resolvedValue: "#ffffff",
      },
    }));

    expect(handle.host.querySelector('[data-test="token-field"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="token-chip"]')?.textContent).toContain("--color-text-primary");
  });

  it("hides the background field immediately after removing a shorthand-backed color", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "background-color": "rgb(255, 255, 255)" });
    handle = mount(createElement(ColorPicker, {
      element: selected,
      property: "background-color",
      entries: ENTRIES,
      tokenRow: {
        ...TOKEN_ROW,
        property: "background",
        declaredValue: "var(--color-surface-raised)",
        authored: "var(--color-surface-raised)",
        resolvedValue: "#ffffff",
      },
    }));

    act(() => {
      (handle.host.querySelector('[data-test="remove-color"]') as HTMLButtonElement).click();
    });

    expect(handle.host.querySelector('[data-test="token-field"]')).toBeNull();
    expect(handle.host.querySelector('[data-test="add-color"]')).toBeTruthy();
  });

  it.each(["none", "transparent", "rgba(0, 0, 0, 0)", "rgb(0 0 0 / 0)", "#00000000", "rgba(40, 80, 120, 0)", "#ff000000"])(
    "treats %s as an empty color value",
    (value) => {
      expect(isEmptyColorValue(value)).toBe(true);
    },
  );

  it("reveals the transparent value after adding an empty color", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ color: "transparent" });
    handle = mount(createElement(ColorPicker, { element: selected, entries: ENTRIES }));

    act(() => {
      (handle.host.querySelector('[data-test="add-color"]') as HTMLButtonElement).click();
    });

    expect(handle.host.querySelector('[data-test="token-field"]')).toBeTruthy();
    expect((handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement).value).toBe("transparent");
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
    expect(handle.host.querySelector('[data-test="add-color"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="remove-color"]')).toBeNull();
  });
});
