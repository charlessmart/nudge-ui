// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
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
    expect(handle.host.querySelector('[data-test="layout-direction-row"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-direction-column"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-direction-reverse"]')).toBeTruthy();
    expect(handle.host.querySelectorAll('[data-test^="layout-align-"]')).toHaveLength(9);
    expect(handle.host.querySelector('[data-test="layout-select-justify-content"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-select-align-items"]')).toBeTruthy();
    expect(
      Array.from((handle.host.querySelector('[data-test="layout-select-justify-content"]') as HTMLSelectElement).options)
        .map((option) => option.value),
    ).toEqual(["flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly"]);
    expect(
      Array.from((handle.host.querySelector('[data-test="layout-select-align-items"]') as HTMLSelectElement).options)
        .map((option) => option.value),
    ).toEqual(["stretch", "flex-start", "flex-end", "center", "baseline"]);
    expect(handle.host.querySelector('[data-test="layout-select-flex-wrap"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-select-align-content"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-gap"]')).toBeTruthy();
  });

  it("writes flex direction and alignment through the compact controls", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      display: "flex",
      position: "static",
      "flex-direction": "row",
      "justify-content": "flex-start",
      "align-items": "flex-start",
    });
    handle = mount(createElement(LayoutSection, { element: selected }));

    (handle.host.querySelector('[data-test="layout-direction-column"]') as HTMLButtonElement).click();
    (handle.host.querySelector('[data-test="layout-align-center-center"]') as HTMLButtonElement).click();

    expect(sheetText()).toContain("flex-direction: column;");
    expect(sheetText()).toContain("justify-content: center;");
    expect(sheetText()).toContain("align-items: center;");
  });

  it("supports reverse flex directions through the compact control", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "flex", position: "static", "flex-direction": "row" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    (handle.host.querySelector('[data-test="layout-direction-reverse"]') as HTMLButtonElement).click();

    expect(sheetText()).toContain("flex-direction: row-reverse;");
  });

  it("hides flex container properties when display is block", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "static" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-flex-container"]')).toBeFalsy();
  });

  it("refreshes conditional sections after display and position edits", () => {
    const { selected, el } = makeSelected();
    let display = "block";
    let position = "static";
    let editCount = 0;
    const original = window.getComputedStyle;
    (window as unknown as { getComputedStyle: typeof getComputedStyle }).getComputedStyle = ((target: Element) => {
      const base = original(target);
      const values = target === el ? { display, position } : {};
      return new Proxy(base, {
        get(source, key: string) {
          if (key === "getPropertyValue") {
            return (property: string) => values[property as "display" | "position"] ?? source.getPropertyValue(property);
          }
          if (key in values) return values[key as "display" | "position"];
          const value = Reflect.get(source, key);
          return typeof value === "function" ? value.bind(source) : value;
        },
      });
    }) as typeof getComputedStyle;

    handle = mount(createElement(LayoutSection, {
      element: selected,
      onAfterEdit: () => {
        editCount += 1;
        if (editCount === 1) display = "flex";
        if (editCount === 2) position = "absolute";
      },
    }));

    expect(handle.host.querySelector('[data-test="layout-flex-container"]')).toBeFalsy();
    expect(handle.host.querySelector('[data-test="layout-inset"]')).toBeFalsy();

    act(() => {
      setSelectValue(handle.host.querySelector('[data-test="layout-select-display"]') as HTMLSelectElement, "flex");
    });
    expect(handle.host.querySelector('[data-test="layout-flex-container"]')).toBeTruthy();

    act(() => {
      setSelectValue(handle.host.querySelector('[data-test="layout-select-position"]') as HTMLSelectElement, "absolute");
    });
    expect(handle.host.querySelector('[data-test="layout-inset"]')).toBeTruthy();
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
