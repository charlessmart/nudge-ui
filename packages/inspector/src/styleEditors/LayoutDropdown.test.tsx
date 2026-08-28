// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { LayoutDropdown } from "./LayoutDropdown.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import {
  makeSelected,
  mount,
  setSelectValue,
  selectOptionValues,
  mockComputedStyle,
  restoreComputedStyle,
  sheetText,
  type MountHandle,
} from "./_testUtils.ts";

describe("LayoutDropdown", () => {
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
    const select = handle.host.querySelector('[data-test="layout-select-flex-direction"]') as HTMLElement;
    expect(select).toBeTruthy();
    expect(select.textContent).toContain("Row");
    expect(selectOptionValues(select)).toEqual(["row", "row-reverse", "column", "column-reverse"]);
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
    const select = handle.host.querySelector('[data-test="layout-select-flex-direction"]') as HTMLElement;
    expect(select.textContent).toContain("Column");
  });

  it("supports stacked fields for paired layout controls", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "justify-content": "center" });
    handle = mount(
      createElement(LayoutDropdown, {
        property: "justify-content",
        options: ["flex-start", "center", "flex-end"],
        domElement: el,
        stacked: true,
      }),
    );

    expect(handle.host.querySelector('[data-test="layout-dropdown"]')?.className).toContain("field-row--stacked");
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
    const select = handle.host.querySelector('[data-test="layout-select-flex-direction"]') as HTMLElement;
    setSelectValue(select, "column");

    expect(sheetText()).toContain('[data-cid="Button"][data-src="src/Button.tsx:1:1"]');
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
    const select = handle.host.querySelector('[data-test="layout-select-flex-direction"]') as HTMLElement;
    expect(select.textContent).toContain("Custom Value");
    const optionValues = selectOptionValues(select);
    expect(optionValues).toContain("custom-value");
  });
});
