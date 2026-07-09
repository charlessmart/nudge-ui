// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { LayoutDropdown } from "./LayoutDropdown.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import {
  makeSelected,
  mount,
  setSelectValue,
  mockComputedStyle,
  restoreComputedStyle,
  sheetText,
  type MountHandle,
} from "./_testUtils.ts";

describe("LayoutDropdown", () => {
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

  it("renders property label and select with options", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "flex-direction": "row" });
    handle = mount(
      createElement(LayoutDropdown, {
        property: "flex-direction",
        options: ["row", "row-reverse", "column", "column-reverse"],
        domElement: el,
      }),
    );
    const select = handle.host.querySelector('[data-test="layout-select-flex-direction"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe("row");
    expect(select.options.length).toBe(4);
  });

  it("pre-selects the computed value", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "flex-direction": "column" });
    handle = mount(
      createElement(LayoutDropdown, {
        property: "flex-direction",
        options: ["row", "row-reverse", "column", "column-reverse"],
        domElement: el,
      }),
    );
    const select = handle.host.querySelector('[data-test="layout-select-flex-direction"]') as HTMLSelectElement;
    expect(select.value).toBe("column");
  });

  it("writes to managed stylesheet on select change", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "flex-direction": "row" });
    handle = mount(
      createElement(LayoutDropdown, {
        property: "flex-direction",
        options: ["row", "row-reverse", "column", "column-reverse"],
        domElement: el,
      }),
    );
    const select = handle.host.querySelector('[data-test="layout-select-flex-direction"]') as HTMLSelectElement;
    setSelectValue(select, "column");

    expect(sheetText()).toContain('[data-cid="Button"][data-src*="src/Button.tsx:1"]');
    expect(sheetText()).toContain("flex-direction: column;");
  });

  it("appends current value to options when not in default list", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "flex-direction": "custom-value" });
    handle = mount(
      createElement(LayoutDropdown, {
        property: "flex-direction",
        options: ["row", "column"],
        domElement: el,
      }),
    );
    const select = handle.host.querySelector('[data-test="layout-select-flex-direction"]') as HTMLSelectElement;
    expect(select.value).toBe("custom-value");
    const optionValues = Array.from(select.options).map((o) => o.value);
    expect(optionValues).toContain("custom-value");
  });
});
