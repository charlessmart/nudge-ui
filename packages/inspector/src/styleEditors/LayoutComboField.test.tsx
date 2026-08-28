// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { LayoutComboField } from "./LayoutComboField.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
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

describe("LayoutComboField", () => {
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
    const select = handle.host.querySelector('[data-test="layout-combo-select-flex-grow"]') as HTMLElement;
    expect(select).toBeTruthy();
    expect(select.textContent).toContain("1");
  });

  it("keeps flex-basis auto as an explicit preset", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "flex-basis": "auto" });
    handle = mount(
      createElement(LayoutComboField, {
        property: "flex-basis",
        presets: ["auto", "0", "100%", "50%", "fit-content"],
        domElement: el,
      }),
    );
    const select = handle.host.querySelector('[data-test="layout-combo-select-flex-basis"]') as HTMLElement;
    expect(select.textContent).toContain("Auto");
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
    const select = handle.host.querySelector('[data-test="layout-combo-select-flex-grow"]') as HTMLElement;
    expect(select.textContent).toContain("Custom…");
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
    const select = handle.host.querySelector('[data-test="layout-combo-select-flex-grow"]') as HTMLElement;
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
    const select = handle.host.querySelector('[data-test="layout-combo-select-flex-grow"]') as HTMLElement;
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
    const select = handle.host.querySelector('[data-test="layout-combo-select-flex-grow"]') as HTMLElement;
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

  it("adds px to a bare custom gap value", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "row-gap": "0px" });
    handle = mount(
      createElement(LayoutComboField, {
        property: "row-gap",
        presets: ["0", "1rem"],
        domElement: el,
      }),
    );
    const select = handle.host.querySelector('[data-test="layout-combo-select-row-gap"]') as HTMLElement;
    setSelectValue(select, "__custom__");
    const input = handle.host.querySelector('[data-test="layout-combo-input-row-gap"]') as HTMLInputElement;

    setInputValue(input, "12");

    expect(sheetText()).toContain("row-gap: 12px;");
  });

  it("renders a gap as a direct text input when inputOnly is enabled", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "column-gap": "8px" });
    handle = mount(
      createElement(LayoutComboField, {
        property: "column-gap",
        presets: ["0", "1rem"],
        domElement: el,
        inputOnly: true,
      }),
    );

    expect(handle.host.querySelector('[data-test="layout-combo-select-column-gap"]')).toBeFalsy();
    const input = handle.host.querySelector('[data-test="layout-combo-input-column-gap"]') as HTMLInputElement;
    expect(input.value).toBe("8px");

    setInputValue(input, "12");

    expect(sheetText()).toContain("column-gap: 12px;");
  });

  it("nudges a custom layout value immediately", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "row-gap": "12px" });
    handle = mount(
      createElement(LayoutComboField, {
        property: "row-gap",
        presets: ["0", "1rem"],
        domElement: el,
      }),
    );
    const select = handle.host.querySelector('[data-test="layout-combo-select-row-gap"]') as HTMLElement;
    setSelectValue(select, "__custom__");
    const input = handle.host.querySelector('[data-test="layout-combo-input-row-gap"]') as HTMLInputElement;

    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", {
        key: "ArrowUp",
        shiftKey: true,
        bubbles: true,
        cancelable: true,
      }));
    });

    expect(input.value).toBe("20px");
    expect(sheetText()).toContain("row-gap: 20px;");
  });
});
