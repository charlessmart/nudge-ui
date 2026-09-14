// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { GridValueField } from "./GridValueField.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import {
  makeSelected,
  makeMixedStyleSelection,
  mockComputedStyle,
  mount,
  restoreComputedStyle,
  setInputValue,
  sheetText,
  type MountHandle,
} from "./_testUtils.ts";

describe("GridValueField", () => {
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

  it("keeps nested track functions as-authored and writes one longhand", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "grid-template-columns": "repeat(auto-fit, minmax(12rem, 1fr))",
    });
    handle = mount(createElement(GridValueField, {
      property: "grid-template-columns",
      domElement: selected.domElement,
    }));

    const input = handle.host.querySelector('[data-test="layout-grid-input-grid-template-columns"]') as HTMLInputElement;
    expect(input.value).toBe("repeat(auto-fit, minmax(12rem, 1fr))");
    setInputValue(input, "repeat(3, minmax(0, 1fr))");

    expect(sheetText()).toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
  });

  it("does not add units or nudge raw placement values", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "grid-column": "2 / span 3" });
    handle = mount(createElement(GridValueField, {
      property: "grid-column",
      domElement: selected.domElement,
    }));

    const input = handle.host.querySelector('[data-test="layout-grid-input-grid-column"]') as HTMLInputElement;
    expect(input.value).toBe("2 / span 3");
    setInputValue(input, "sidebar / content-end");

    expect(sheetText()).toContain("grid-column: sidebar / content-end;");
    expect(sheetText()).not.toContain("content-endpx");
  });

  it("cancels the draft and commits nothing on Escape", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "grid-column": "2 / span 2" });
    handle = mount(createElement(GridValueField, {
      property: "grid-column",
      domElement: selected.domElement,
    }));

    const input = handle.host.querySelector('[data-test="layout-grid-input-grid-column"]') as HTMLInputElement;
    input.focus();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "9 / 9");
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    act(() => {
      input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    act(() => input.blur());

    expect(sheetText()).not.toContain("grid-column:");
    expect(input.value).toBe("2 / span 2");
  });

  it("keeps a draft visible while replacing a mixed group value", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "grid-template-columns": "1fr" });
    const selection = makeMixedStyleSelection(selected, "grid-template-columns");
    handle = mount(createElement(GridValueField, {
      property: "grid-template-columns",
      domElement: selected.domElement,
      selection,
    }));
    const input = handle.host.querySelector('[data-test="layout-grid-input-grid-template-columns"]') as HTMLInputElement;

    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "repeat(");
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(input.value).toBe("repeat(");
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "repeat(3,");
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(input.value).toBe("repeat(3,");
  });
});
