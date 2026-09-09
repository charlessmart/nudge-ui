// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { LayoutComboField } from "./LayoutComboField.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import {
  makeSelected,
  makeMixedStyleSelection,
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

  it("keeps a draft visible while replacing a mixed group value", () => {
    const { el, selected } = makeSelected();
    mockComputedStyle({ "column-gap": "8px" });
    const selection = makeMixedStyleSelection(selected, "column-gap");
    handle = mount(createElement(LayoutComboField, {
      property: "column-gap",
      presets: ["0", "1rem"],
      domElement: el,
      selection,
      inputOnly: true,
    }));
    const input = handle.host.querySelector('[data-test="layout-combo-input-column-gap"]') as HTMLInputElement;

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "1");
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(input.value).toBe("1");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "12");
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(input.value).toBe("12");
  });

  it("shows the authored gap expression instead of the resolved pixel value", () => {
    const { el } = makeSelected();
    const authored = "clamp(48px, 8vw, 140px)";
    el.style.setProperty("gap", authored);
    mockComputedStyle({ "column-gap": "139.68px" });
    handle = mount(
      createElement(LayoutComboField, {
        property: "column-gap",
        presets: ["0", "1rem"],
        domElement: el,
        inputOnly: true,
      }),
    );

    const input = handle.host.querySelector('[data-test="layout-combo-input-column-gap"]') as HTMLInputElement;
    expect(input.value).toBe(authored);
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

  it("disables the gap field and explains why when gap is set inline", () => {
    const { el } = makeSelected();
    el.style.setProperty("gap", "16px");
    mockComputedStyle({ "column-gap": "16px" });
    handle = mount(
      createElement(LayoutComboField, {
        property: "column-gap",
        presets: ["0", "8px", "16px"],
        domElement: el,
        inputOnly: true,
      }),
    );
    const input = handle.host.querySelector('[data-test="layout-combo-input-column-gap"]') as HTMLInputElement;
    expect(input.disabled).toBe(true);

    const blocked = handle.host.querySelector('[data-test="layout-combo-blocked"]') as HTMLElement;
    expect(blocked?.getAttribute("aria-label")).toContain("gap: 16px");
  });

  it("disables the field when the longhand itself is set inline", () => {
    const { el } = makeSelected();
    el.style.setProperty("column-gap", "16px");
    mockComputedStyle({ "column-gap": "16px" });
    handle = mount(
      createElement(LayoutComboField, {
        property: "column-gap",
        presets: ["0", "8px", "16px"],
        domElement: el,
      }),
    );
    const select = handle.host.querySelector('[data-test="layout-combo-select-column-gap"]') as HTMLElement;
    expect(select.hasAttribute("disabled")).toBe(true);

    expect(handle.host.querySelector('[data-test="layout-combo-blocked"]')).toBeTruthy();
  });

  it("writes nothing to the managed sheet while blocked by inline styles", () => {
    const { el } = makeSelected();
    el.style.setProperty("gap", "16px");
    mockComputedStyle({ "column-gap": "16px" });
    handle = mount(
      createElement(LayoutComboField, {
        property: "column-gap",
        presets: ["0", "8px", "16px"],
        domElement: el,
        inputOnly: true,
      }),
    );
    const input = handle.host.querySelector('[data-test="layout-combo-input-column-gap"]') as HTMLInputElement;

    setInputValue(input, "24");

    expect(sheetText()).not.toContain("column-gap");
  });

  it("stays enabled when only an unrelated property is set inline", () => {
    const { el } = makeSelected();
    el.style.setProperty("display", "flex");
    mockComputedStyle({ "column-gap": "0px" });
    handle = mount(
      createElement(LayoutComboField, {
        property: "column-gap",
        presets: ["0", "8px", "16px"],
        domElement: el,
        inputOnly: true,
      }),
    );
    const input = handle.host.querySelector('[data-test="layout-combo-input-column-gap"]') as HTMLInputElement;
    expect(input.disabled).toBe(false);
    expect(handle.host.querySelector('[data-test="layout-combo-blocked"]')).toBeNull();
  });
});
