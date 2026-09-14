// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import { GridPicker, countGridTracks } from "./GridPicker.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import {
  makeSelected,
  mockComputedStyle,
  mount,
  restoreComputedStyle,
  sheetText,
  type MountHandle,
} from "./_testUtils.ts";

describe("GridPicker", () => {
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

  it("counts explicit repeat tracks while leaving auto-fit for computed CSS", () => {
    expect(countGridTracks("repeat(4, minmax(0, 1fr))")).toBe(4);
    expect(countGridTracks("minmax(0, 1fr) auto")).toBe(2);
    expect(countGridTracks("repeat(auto-fit, minmax(12rem, 1fr))")).toBeNull();
  });

  it("closes the cell picker when clicking outside it", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "grid-template-columns": "repeat(4, minmax(0, 1fr))",
      "grid-template-rows": "repeat(3, minmax(0, 1fr))",
    });
    handle = mount(createElement(GridPicker, { domElement: selected.domElement }));

    const trigger = handle.host.querySelector('[data-test="layout-grid-picker-trigger"]') as HTMLButtonElement;
    const outside = document.createElement("button");
    document.body.appendChild(outside);

    act(() => trigger.click());
    expect(handle.host.querySelector('[data-test="layout-grid-picker-popover"]')).toBeTruthy();

    act(() => outside.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(handle.host.querySelector('[data-test="layout-grid-picker-popover"]')).toBeFalsy();
  });

  it("opens a cell picker and writes the selected rows and columns", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "grid-template-columns": "repeat(4, minmax(0, 1fr))",
      "grid-template-rows": "repeat(3, minmax(0, 1fr))",
    });
    handle = mount(createElement(GridPicker, { domElement: selected.domElement }));

    const trigger = handle.host.querySelector('[data-test="layout-grid-picker-trigger"]') as HTMLButtonElement;
    expect(trigger.getAttribute("aria-label")).toBe("Grid 4 by 3");
    expect(handle.host.querySelector('[data-test="layout-grid-picker-popover"]')).toBeFalsy();

    act(() => trigger.click());
    expect(handle.host.querySelector('[data-test="layout-grid-picker-popover"]')).toBeTruthy();
    expect(handle.host.querySelectorAll('[data-test^="layout-grid-cell-"]')).toHaveLength(96);

    act(() => {
      (handle.host.querySelector('[data-test="layout-grid-cell-5-4"]') as HTMLButtonElement).click();
    });

    expect(sheetText()).toContain("grid-template-columns: repeat(5, minmax(0, 1fr));");
    expect(sheetText()).toContain("grid-template-rows: repeat(4, minmax(0, 1fr));");
    expect(handle.host.querySelector('[data-test="layout-grid-picker-popover"]')).toBeFalsy();
    expect((handle.host.querySelector('[data-test="layout-grid-picker-trigger"]') as HTMLButtonElement).getAttribute("aria-label"))
      .toBe("Grid 5 by 4");
  });
});
