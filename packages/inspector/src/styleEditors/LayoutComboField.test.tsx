// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { LayoutComboField } from "./LayoutComboField.tsx";
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

describe("LayoutComboField", () => {
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

  it("renders presets in select and pre-selects current value", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "flex-grow": "1" });
    handle = mount(
      createElement(LayoutComboField, {
        property: "flex-grow",
        presets: ["0", "1", "2", "3"],
        domElement: el,
      }),
    );
    const select = handle.host.querySelector('[data-test="layout-combo-select-flex-grow"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe("1");
  });

  it('selects "Custom…" when current value is not a preset', () => {
    const { el } = makeSelected();
    mockComputedStyle({ "flex-grow": "5" });
    handle = mount(
      createElement(LayoutComboField, {
        property: "flex-grow",
        presets: ["0", "1", "2", "3"],
        domElement: el,
      }),
    );
    const select = handle.host.querySelector('[data-test="layout-combo-select-flex-grow"]') as HTMLSelectElement;
    expect(select.value).toBe("__custom__");
  });

  it("writes preset value to managed stylesheet on select change", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "flex-grow": "0" });
    handle = mount(
      createElement(LayoutComboField, {
        property: "flex-grow",
        presets: ["0", "1", "2", "3"],
        domElement: el,
      }),
    );
    const select = handle.host.querySelector('[data-test="layout-combo-select-flex-grow"]') as HTMLSelectElement;
    setSelectValue(select, "2");

    expect(sheetText()).toContain("flex-grow: 2;");
  });

  it("selecting Custom… reveals a text input", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "flex-grow": "0" });
    handle = mount(
      createElement(LayoutComboField, {
        property: "flex-grow",
        presets: ["0", "1"],
        domElement: el,
      }),
    );
    const select = handle.host.querySelector('[data-test="layout-combo-select-flex-grow"]') as HTMLSelectElement;
    setSelectValue(select, "__custom__");

    const input = handle.host.querySelector('[data-test="layout-combo-input-flex-grow"]') as HTMLInputElement;
    expect(input).toBeTruthy();
  });

  it("waits until the custom input blurs before applying the layout value", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "flex-grow": "0" });
    handle = mount(
      createElement(LayoutComboField, {
        property: "flex-grow",
        presets: ["0", "1"],
        domElement: el,
      }),
    );
    const select = handle.host.querySelector('[data-test="layout-combo-select-flex-grow"]') as HTMLSelectElement;
    setSelectValue(select, "__custom__");
    const input = handle.host.querySelector('[data-test="layout-combo-input-flex-grow"]') as HTMLInputElement;

    act(() => {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "4");
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(sheetText()).toBe("");

    act(() => input.blur());
    expect(sheetText()).toContain("flex-grow: 4;");
  });
});
