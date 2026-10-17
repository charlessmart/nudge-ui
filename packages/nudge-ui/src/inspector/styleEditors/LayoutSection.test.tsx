// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { LayoutSection } from "./LayoutSection.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";
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

describe("LayoutSection", () => {
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
    const columnGap = handle.host.querySelector('[data-test="layout-combo"][data-property="column-gap"]');
    expect(columnGap).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-spacing-icon-column-gap"]')).toBeTruthy();
  });

  it("adds a separate line gap when flex items wrap", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      display: "flex",
      position: "static",
      "flex-direction": "row",
      "flex-wrap": "wrap",
      "row-gap": "12px",
      "column-gap": "8px",
    });
    handle = mount(createElement(LayoutSection, { element: selected }));

    const spacing = handle.host.querySelector('[data-test="layout-gap"]');
    expect(spacing?.textContent).not.toContain("Items");
    expect(spacing?.textContent).not.toContain("Lines");
    expect(spacing?.querySelector('[data-test="layout-combo"][data-property="row-gap"]')).toBeTruthy();
    expect(spacing?.querySelector('[data-test="layout-combo"][data-property="column-gap"]')).toBeTruthy();
    expect(spacing?.querySelector('[data-test="layout-spacing-icon-column-gap"]')).toBeTruthy();
    expect(spacing?.querySelector('[data-test="layout-spacing-icon-row-gap"]')).toBeTruthy();
  });

  it("shows the effective start placement for the computed normal value", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      display: "flex",
      position: "static",
      "justify-content": "normal",
      "align-items": "center",
    });
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-align-center-flex-start"]')?.getAttribute("aria-pressed"))
      .toBe("true");
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

    expect(handle.host.querySelector('[data-test="layout-spacing-icon-row-gap"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-spacing-icon-column-gap"]')).toBeFalsy();

    // In a column layout the top-middle cell is justify-content: flex-start + align-items: center.
    act(() => {
      (handle.host.querySelector('[data-test="layout-align-center-flex-start"]') as HTMLButtonElement).click();
    });

    expect(sheetText()).toContain("justify-content: flex-start;");
    expect(sheetText()).toContain("align-items: center;");
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

  it("renders size controls for every selected element", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "static", width: "240px", height: "120px" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    act(() => (handle.host.querySelector('[data-test="layout-size-expand"]') as HTMLButtonElement).click());

    for (const property of ["width", "height", "min-width", "min-height", "max-width", "max-height"]) {
      expect(handle.host.querySelector(`[data-test="layout-size-${property}"]`)).toBeTruthy();
    }
    expect(handle.host.querySelector('[data-test="layout-size-aspect-ratio"]')).toBeTruthy();
  });

  it("shows the used size beside auto but not beside a fixed pixel size", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "static", width: "812px", height: "436px" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-resolved-width"]')?.textContent).toBe("812");
    expect(handle.host.querySelector('[data-test="layout-resolved-height"]')?.textContent).toBe("436");

    selected.domElement.style.width = "240px";
    act(() => handle.root.render(createElement(LayoutSection, { element: selected })));

    expect(handle.host.querySelector('[data-test="layout-resolved-width"]')).toBeNull();
    expect(handle.host.querySelector('[data-test="layout-resolved-height"]')?.textContent).toBe("436");
  });

  it("shows meaningful defaults instead of used pixel dimensions", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "static", width: "812px", height: "436px" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect((handle.host.querySelector('[data-test="layout-size-width"] [data-test="raw-input"]') as HTMLInputElement).value).toBe("auto");
    expect((handle.host.querySelector('[data-test="layout-size-height"] [data-test="raw-input"]') as HTMLInputElement).value).toBe("auto");

    act(() => (handle.host.querySelector('[data-test="layout-size-expand"]') as HTMLButtonElement).click());

    expect((handle.host.querySelector('[data-test="layout-size-min-width"] [data-test="raw-input"]') as HTMLInputElement).value).toBe("0");
    expect((handle.host.querySelector('[data-test="layout-size-max-width"] [data-test="raw-input"]') as HTMLInputElement).value).toBe("none");
  });



  it("writes layout mode, alignment and wrap through the controls", () => {
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
      (handle.host.querySelector('[data-test="layout-mode-column"]') as HTMLButtonElement).click();
      (handle.host.querySelector('[data-test="layout-align-center-center"]') as HTMLButtonElement).click();
      (handle.host.querySelector('[data-test="layout-flex-wrap-toggle"]') as HTMLButtonElement).click();
    });

    expect(sheetText()).toContain("flex-direction: column;");
    expect(sheetText()).toContain("justify-content: center;");
    expect(sheetText()).toContain("align-items: center;");
    expect(sheetText()).toContain("flex-wrap: wrap;");
  });

  it("writes distribution from the toggles and cross-axis fit from the layout options", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      display: "flex",
      position: "static",
      "justify-content": "flex-start",
      "align-items": "flex-start",
    });
    handle = mount(createElement(LayoutSection, { element: selected }));

    act(() => {
      (handle.host.querySelector('[data-test="layout-flex-distribution"]') as HTMLButtonElement).click();
    });
    const distribution = document.body.querySelector(
      '[data-test="layout-flex-distribution-space-between"]',
    ) as HTMLElement;
    expect(distribution).toBeTruthy();
    act(() => distribution.click());

    expect(sheetText()).toContain("justify-content: space-between;");

    act(() => {
      (handle.host.querySelector('[data-test="layout-options"]') as HTMLButtonElement).click();
    });
    const alignItems = document.body.querySelector('[data-test="layout-select-align-items"]') as HTMLElement;
    expect(alignItems).toBeTruthy();
    setSelectValue(alignItems, "stretch");
    expect(sheetText()).toContain("align-items: stretch;");
  });

  it("shows both gap axes when selected flex containers use mixed axes", () => {
    const first = makeSelected("Stack", "src/Stack.tsx:1:1");
    const second = makeSelected("Stack", "src/Stack.tsx:2:1");
    mockComputedStyle({ display: "flex", position: "static", "flex-direction": "row", "flex-wrap": "nowrap" });
    const mixedProperty = (property: string) => ({
      property,
      value: { kind: "mixed" as const },
      token: { kind: "none" as const },
      primaryRow: null,
    });
    const selection = {
      primary: second.selected,
      elements: [first.selected, second.selected],
      domElements: [first.el, second.el],
      target: [first.el, second.el],
      primaryRows: [],
      getProperty: (property: string) => property === "flex-direction"
        ? mixedProperty(property)
        : property === "flex-wrap"
          ? mixedProperty(property)
          : null,
      supportsRole: (role: string) => role === "flex-container",
    } as StyleSelection;

    handle = mount(createElement(LayoutSection, { element: second.selected, selection }));

    expect(handle.host.querySelector('[data-test="layout-combo"][data-property="row-gap"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-combo"][data-property="column-gap"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-flex-axis-mixed"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-mode-row"]')?.getAttribute("aria-pressed")).toBe("false");
    expect(handle.host.querySelector('[data-test="layout-mode-column"]')?.getAttribute("aria-pressed")).toBe("false");
    expect(handle.host.querySelector('[data-test="layout-flex-wrap-toggle"]')?.getAttribute("aria-pressed")).toBe("mixed");
  });

  it("sets reverse flex directions from the layout options", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "flex", position: "static", "flex-direction": "row" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    act(() => {
      (handle.host.querySelector('[data-test="layout-options"]') as HTMLButtonElement).click();
    });
    setSelectValue(document.body.querySelector('[data-test="layout-select-flex-direction"]') as HTMLElement, "row-reverse");

    expect(sheetText()).toContain("flex-direction: row-reverse;");
  });

  it("marks the mode that matches the display and flex direction", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "flex", position: "static", "flex-direction": "column-reverse" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    const pressed = (mode: string) => handle.host.querySelector(`[data-test="layout-mode-${mode}"]`)?.getAttribute("aria-pressed");
    expect(pressed("column")).toBe("true");
    expect(pressed("row")).toBe("false");
    expect(pressed("block")).toBe("false");
    expect(pressed("grid")).toBe("false");
  });

  it("leaves every mode unmarked for displays without a segment", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "inline", position: "static" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    for (const mode of ["block", "row", "column", "grid"]) {
      expect(handle.host.querySelector(`[data-test="layout-mode-${mode}"]`)?.getAttribute("aria-pressed")).toBe("false");
    }
  });

  it("writes display and direction when switching to a flex column", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "static", "flex-direction": "row" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    act(() => (handle.host.querySelector('[data-test="layout-mode-column"]') as HTMLButtonElement).click());

    expect(sheetText()).toContain("display: flex;");
    expect(sheetText()).toContain("flex-direction: column;");
  });

  it("keeps an inline outer display when switching mode", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "inline-flex", position: "static", "flex-direction": "row" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    act(() => (handle.host.querySelector('[data-test="layout-mode-grid"]') as HTMLButtonElement).click());

    expect(sheetText()).toContain("display: inline-grid;");
  });

  it("writes overflow and the full display list from the layout options", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "static", overflow: "visible" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(document.body.querySelector('[data-test="layout-options-content"]')).toBeFalsy();
    act(() => (handle.host.querySelector('[data-test="layout-options"]') as HTMLButtonElement).click());
    const display = document.body.querySelector('[data-test="layout-select-display"]') as HTMLElement;
    expect(selectOptionValues(display)).toContain("inline-grid");
    setSelectValue(document.body.querySelector('[data-test="layout-select-overflow"]') as HTMLElement, "hidden");

    expect(sheetText()).toContain("overflow: hidden;");
  });

  it("shows padding in the layout section and margin in the position section", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "static" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="spacing-padding"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="spacing-margin"]')).toBeFalsy();
  });

  it("refreshes the flex controls after switching to a flex mode", () => {
    const { selected, el } = makeSelected();
    let display = "block";
    let editCount = 0;
    const original = window.getComputedStyle;
    (window as unknown as { getComputedStyle: typeof getComputedStyle }).getComputedStyle = ((target: Element) => {
      const base = original(target);
      const values = target === el ? { display, position: "static" } : {};
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
      },
    }));

    expect(handle.host.querySelector('[data-test="layout-flex-container"]')).toBeFalsy();

    act(() => (handle.host.querySelector('[data-test="layout-mode-row"]') as HTMLButtonElement).click());
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
    expect(handle.host.querySelector('[data-test="layout-grid-input-grid-template-columns"]')).toBeFalsy();
    expect(handle.host.querySelector('[data-test="layout-select-grid-auto-flow"]')).toBeFalsy();
    const gridGap = handle.host.querySelector('[data-test="layout-grid-gap"]');
    expect(gridGap).toBeTruthy();
    for (const property of ["row-gap", "column-gap"]) {
      const surface = gridGap?.querySelector(`[data-test="layout-grid-${property}"]`);
      expect(surface?.querySelector(`[data-test="layout-spacing-icon-${property}"]`)).toBeTruthy();
    }
    const options = handle.host.querySelector('[data-test="layout-options"]') as HTMLButtonElement;
    expect(options.getAttribute("aria-label")).toBe("Layout options");
    expect(document.body.querySelector('[data-test="layout-options-content"]')).toBeFalsy();

    act(() => options.click());
    const advanced = document.body.querySelector('[data-test="layout-options-content"]');
    expect(advanced?.querySelector('[data-test="layout-grid-advanced"]')).toBeTruthy();
    expect(advanced?.querySelector('[data-test="layout-grid-input-grid-template-columns"]')).toBeTruthy();
    expect(advanced?.querySelector('[data-test="layout-grid-alignment"]')).toBeTruthy();

    const autoFlow = advanced?.querySelector('[data-test="layout-select-grid-auto-flow"]') as HTMLElement;
    expect(selectOptionValues(autoFlow)).toEqual(["row", "column", "row dense", "column dense"]);
  });

  it("refreshes Grid visibility after selecting the grid mode", () => {
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

    act(() => (handle.host.querySelector('[data-test="layout-mode-grid"]') as HTMLButtonElement).click());
    expect(handle.host.querySelector('[data-test="layout-grid-container"]')).toBeTruthy();
    expect(sheetText()).toContain("display: grid;");
  });

  it("writes a display change to the managed stylesheet from the layout options", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "static" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    act(() => (handle.host.querySelector('[data-test="layout-options"]') as HTMLButtonElement).click());
    setSelectValue(document.body.querySelector('[data-test="layout-select-display"]') as HTMLElement, "flex");

    expect(sheetText()).toContain("display: flex;");
  });
});
