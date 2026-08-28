// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { GridValueField } from "./GridValueField.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import {
  makeSelected,
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
});
