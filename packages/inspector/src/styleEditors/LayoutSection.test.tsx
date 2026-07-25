// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { LayoutSection } from "./LayoutSection.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import {
  makeSelected,
  mount,
  setInputValue,
  setSelectValue,
  selectOptionValues,
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
    expect(handle.host.querySelector('[data-test="layout-flex-wrap-toggle"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-flex-settings"]')).toBeTruthy();
    expect(handle.host.querySelectorAll('[data-test^="layout-align-"]')).toHaveLength(9);
    expect(handle.host.querySelector('[data-test="layout-select-justify-content"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-select-align-items"]')).toBeTruthy();
    expect(
      selectOptionValues(handle.host.querySelector('[data-test="layout-select-justify-content"]') as HTMLElement),
    ).toEqual(["flex-start", "flex-end", "center", "space-between", "space-around", "space-evenly"]);
    expect(
      selectOptionValues(handle.host.querySelector('[data-test="layout-select-align-items"]') as HTMLElement),
    ).toEqual(["stretch", "flex-start", "flex-end", "center", "baseline"]);
    expect(handle.host.querySelector('[data-test="layout-select-flex-wrap"]')).toBeFalsy();
    expect(handle.host.querySelector('[data-test="layout-select-align-content"]')).toBeFalsy();
    expect(handle.host.querySelector('[data-test="layout-gap"]')).toBeTruthy();
  });

  it("shows only the relevant gap axis when flex items do not wrap", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      display: "flex",
      position: "static",
      "flex-direction": "row",
      "flex-wrap": "nowrap",
      "row-gap": "0px",
      "column-gap": "8px",
    });
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-combo"][data-property="row-gap"]')).toBeFalsy();
    expect(handle.host.querySelector('[data-test="layout-combo"][data-property="column-gap"]')).toBeTruthy();
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

    act(() => {
      (handle.host.querySelector('[data-test="layout-direction-column"]') as HTMLButtonElement).click();
      (handle.host.querySelector('[data-test="layout-align-center-center"]') as HTMLButtonElement).click();
      (handle.host.querySelector('[data-test="layout-flex-wrap-toggle"]') as HTMLButtonElement).click();
    });

    expect(sheetText()).toContain("flex-direction: column;");
    expect(sheetText()).toContain("justify-content: center;");
    expect(sheetText()).toContain("align-items: center;");
    expect(sheetText()).toContain("flex-wrap: wrap;");
  });

  it("offers space-between as a selectable settings suggestion", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      display: "flex",
      position: "static",
      "justify-content": "flex-start",
    });
    handle = mount(createElement(LayoutSection, { element: selected }));

    act(() => {
      (handle.host.querySelector('[data-test="layout-flex-settings"]') as HTMLButtonElement).click();
    });
    const suggestion = document.body.querySelector(
      '[data-test="layout-flex-setting-justify-space-between"]',
    ) as HTMLElement;
    expect(suggestion).toBeTruthy();
    expect(suggestion.textContent).toContain("space-between");

    act(() => suggestion.click());

    expect(sheetText()).toContain("justify-content: space-between;");
  });

  it("rotates the alignment grid axes for column directions", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      display: "flex",
      position: "static",
      "flex-direction": "column",
      "justify-content": "center",
      "align-items": "flex-start",
    });
    handle = mount(createElement(LayoutSection, { element: selected }));

    // In a column layout, the top row controls the main axis and the
    // columns control the cross axis. The top-middle cell is therefore
    // justify-content: flex-start + align-items: center.
    act(() => {
      (handle.host.querySelector('[data-test="layout-align-center-flex-start"]') as HTMLButtonElement).click();
    });

    expect(sheetText()).toContain("justify-content: flex-start;");
    expect(sheetText()).toContain("align-items: center;");
  });

  it("supports reverse flex directions through the settings menu", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "flex", position: "static", "flex-direction": "row" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    act(() => {
      (handle.host.querySelector('[data-test="layout-flex-settings"]') as HTMLButtonElement).click();
    });
    const reverseOption = document.body.querySelector(
      '[data-test="layout-flex-setting-direction-reverse"]',
    ) as HTMLElement;
    expect(reverseOption).toBeTruthy();
    act(() => reverseOption.click());

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

    setSelectValue(handle.host.querySelector('[data-test="layout-select-display"]') as HTMLElement, "flex");
    expect(handle.host.querySelector('[data-test="layout-flex-container"]')).toBeTruthy();

    setSelectValue(handle.host.querySelector('[data-test="layout-select-position"]') as HTMLElement, "absolute");
    expect(handle.host.querySelector('[data-test="layout-position"]')).toBeTruthy();
  });

  it("shows flex container properties for inline-flex", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "inline-flex", position: "static" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-flex-container"]')).toBeTruthy();
  });

  it("shows Grid container controls for grid and inline-grid", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      display: "grid",
      position: "static",
      "grid-template-columns": "repeat(2, minmax(0, 1fr))",
      "grid-template-rows": "auto",
      "grid-auto-flow": "row",
    });
    const original = window.getComputedStyle;
    (window as unknown as { getComputedStyle: typeof getComputedStyle }).getComputedStyle = ((target: Element) => {
      const base = original(target);
      return new Proxy(base, {
        get(source, key: string) {
          if (key === "display") return target === selected.domElement ? "grid" : "block";
          if (key === "getPropertyValue") {
            return (property: string) => property === "display"
              ? target === selected.domElement ? "grid" : "block"
              : source.getPropertyValue(property);
          }
          const value = Reflect.get(source, key);
          return typeof value === "function" ? value.bind(source) : value;
        },
      });
    }) as typeof getComputedStyle;
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-grid-container"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-grid-picker"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-grid-child"]')).toBeFalsy();
    expect(handle.host.querySelector('[data-test="layout-grid-input-grid-template-columns"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-select-grid-auto-flow"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-grid-gap"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-grid-alignment"]')).toBeTruthy();

    const autoFlow = handle.host.querySelector('[data-test="layout-select-grid-auto-flow"]') as HTMLElement;
    expect(selectOptionValues(autoFlow)).toEqual(["row", "column", "row dense", "column dense"]);
  });

  it("shows Grid child controls when the parent is a Grid container", () => {
    const { selected, el } = makeSelected();
    const parent = document.createElement("div");
    parent.appendChild(el);
    document.body.appendChild(parent);
    mockComputedStyle({ display: "block", position: "static", "grid-column": "2 / span 3" });

    const original = window.getComputedStyle;
    (window as unknown as { getComputedStyle: typeof getComputedStyle }).getComputedStyle = ((target: Element) => {
      if (target === parent) {
        return {
          display: "grid",
          getPropertyValue: () => "",
        } as unknown as CSSStyleDeclaration;
      }
      return original(target);
    }) as typeof getComputedStyle;

    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-grid-container"]')).toBeFalsy();
    expect(handle.host.querySelector('[data-test="layout-grid-child"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-grid-input-grid-column"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-grid-input-grid-row"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-select-justify-self"]')).toBeTruthy();
  });

  it("refreshes Grid visibility after selecting Grid from Display", () => {
    const { selected, el } = makeSelected();
    let display = "block";
    const original = window.getComputedStyle;
    (window as unknown as { getComputedStyle: typeof getComputedStyle }).getComputedStyle = ((target: Element) => {
      const base = original(target);
      return new Proxy(base, {
        get(source, key: string) {
          if (target === el && key === "display") return display;
          if (target === el && key === "getPropertyValue") {
            return (property: string) => property === "display" ? display : source.getPropertyValue(property);
          }
          const value = Reflect.get(source, key);
          return typeof value === "function" ? value.bind(source) : value;
        },
      });
    }) as typeof getComputedStyle;

    handle = mount(createElement(LayoutSection, {
      element: selected,
      onAfterEdit: () => { display = "grid"; },
    }));
    expect(handle.host.querySelector('[data-test="layout-grid-container"]')).toBeFalsy();

    setSelectValue(handle.host.querySelector('[data-test="layout-select-display"]') as HTMLElement, "grid");
    expect(handle.host.querySelector('[data-test="layout-grid-container"]')).toBeTruthy();
    expect(sheetText()).toContain("display: grid;");
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

  it("shows anchor controls when position is absolute", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "absolute" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-position"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-anchor-horizontal-start"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-position-x"]')).toBeTruthy();
    act(() => {
      (handle.host.querySelector('[data-test="layout-position-individual-toggle"]') as HTMLButtonElement).click();
    });
    expect(handle.host.querySelectorAll('[data-test^="side-value-"]')).toHaveLength(4);
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

    const select = handle.host.querySelector('[data-test="layout-select-display"]') as HTMLElement;
    setSelectValue(select, "flex");

    expect(sheetText()).toContain("display: flex;");
  });

  it("writes an absolute position offset to managed stylesheet", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "flex", position: "absolute", "top": "0px" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    const input = handle.host.querySelector('[data-test="layout-position-y"] [data-test="raw-input"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    setInputValue(input, "50%");

    expect(sheetText()).toContain("top: 50%;");
  });

  it("renders size controls for every selected element", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "static", width: "240px", height: "120px" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    for (const property of ["width", "height", "min-width", "min-height", "max-width", "max-height"]) {
      expect(handle.host.querySelector(`[data-test="layout-size-${property}"]`)).toBeTruthy();
    }
    expect(handle.host.querySelector('[data-test="layout-size-aspect-ratio"]')).toBeTruthy();
  });

  it("shows meaningful defaults instead of used pixel dimensions", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "static", width: "812px", height: "436px" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect((handle.host.querySelector('[data-test="layout-size-width"] [data-test="raw-input"]') as HTMLInputElement).value).toBe("auto");
    expect((handle.host.querySelector('[data-test="layout-size-height"] [data-test="raw-input"]') as HTMLInputElement).value).toBe("auto");
    expect((handle.host.querySelector('[data-test="layout-size-min-width"] [data-test="raw-input"]') as HTMLInputElement).value).toBe("0");
    expect((handle.host.querySelector('[data-test="layout-size-max-width"] [data-test="raw-input"]') as HTMLInputElement).value).toBe("none");
  });

  it("routes an absolute anchor switch through one managed projection", () => {
    const { selected, el } = makeSelected();
    el.style.left = "24px";
    mockComputedStyle({
      display: "block",
      position: "absolute",
      right: "auto",
      top: "12px",
      bottom: "auto",
    });
    handle = mount(createElement(LayoutSection, { element: selected }));

    act(() => {
      (handle.host.querySelector('[data-test="layout-anchor-horizontal-end"]') as HTMLButtonElement).click();
    });

    expect(sheetText()).toContain("left: auto;");
    expect(sheetText()).toContain("right: 24px;");
  });
});
