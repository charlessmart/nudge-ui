// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { LayoutSection } from "./LayoutSection.tsx";
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

describe("LayoutSection", () => {
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

  it("renders display and position dropdowns always", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "static" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-select-display"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-select-position"]')).toBeTruthy();
  });

  it("shows flex container properties when display is flex", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "flex", position: "static" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-flex-container"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-select-flex-direction"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-select-justify-content"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-select-align-items"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-select-flex-wrap"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-select-align-content"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-gap"]')).toBeTruthy();
  });

  it("hides flex container properties when display is block", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "static" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-flex-container"]')).toBeFalsy();
  });

  it("shows flex container properties for inline-flex", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "inline-flex", position: "static" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-flex-container"]')).toBeTruthy();
  });

  it("shows flex child properties when parent is flex", () => {
    const { selected, el } = makeSelected();
    const parent = document.createElement("div");
    parent.appendChild(el);
    document.body.appendChild(parent);
    mockComputedStyle({ display: "block", position: "static" });

    const orig = window.getComputedStyle;
    (window as unknown as { getComputedStyle: typeof getComputedStyle }).getComputedStyle = ((target: Element) => {
      if (target === parent) {
        return {
          display: "flex",
          getPropertyValue: () => "",
        } as unknown as CSSStyleDeclaration;
      }
      return orig(target);
    }) as typeof getComputedStyle;

    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-flex-child"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-select-align-self"]')).toBeTruthy();
  });

  it("hides flex child properties when parent is not flex", () => {
    const { selected, el } = makeSelected();
    const parent = document.createElement("div");
    parent.appendChild(el);
    document.body.appendChild(parent);
    mockComputedStyle({ display: "block", position: "static" });

    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-flex-child"]')).toBeFalsy();
  });

  it("shows inset grid when position is absolute", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "absolute" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-inset"]')).toBeTruthy();
  });

  it("shows inset grid when position is relative", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "relative" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-inset"]')).toBeTruthy();
  });

  it("hides inset grid when position is static", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "static" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-inset"]')).toBeFalsy();
  });

  it("displays both flex container and flex child when both apply", () => {
    const { selected, el } = makeSelected();
    const parent = document.createElement("div");
    parent.appendChild(el);
    document.body.appendChild(parent);
    mockComputedStyle({ display: "flex", position: "static" });

    const orig = window.getComputedStyle;
    (window as unknown as { getComputedStyle: typeof getComputedStyle }).getComputedStyle = ((target: Element) => {
      if (target === parent) {
        return {
          display: "flex",
          getPropertyValue: () => "",
        } as unknown as CSSStyleDeclaration;
      }
      if (target === el) {
        return {
          display: "flex",
          position: "static",
          getPropertyValue: () => "",
        } as unknown as CSSStyleDeclaration;
      }
      return orig(target);
    }) as typeof getComputedStyle;

    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-flex-container"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-flex-child"]')).toBeTruthy();
  });

  it("writes display change to managed stylesheet", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "static" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    const select = handle.host.querySelector('[data-test="layout-select-display"]') as HTMLSelectElement;
    setSelectValue(select, "flex");

    expect(sheetText()).toContain("display: flex;");
  });

  it("writes inset change to managed stylesheet", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "flex", position: "absolute", "top": "0px" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    const select = handle.host.querySelector('[data-test="layout-combo-select-top"]') as HTMLSelectElement;
    setSelectValue(select, "50%");

    expect(sheetText()).toContain("top: 50%;");
  });
});
