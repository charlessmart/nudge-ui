// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { LayoutSection } from "./LayoutSection.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import type { StyleSelection } from "../selection/styleSelection.ts";
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

  it("keeps a bare relative position in the layout options with its insets", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "relative", "z-index": "auto" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-position"]')).toBeFalsy();
    expect(handle.host.querySelector('[data-test="layout-inset"]')).toBeFalsy();
    act(() => (handle.host.querySelector('[data-test="layout-options"]') as HTMLButtonElement).click());
    expect(document.body.querySelector('[data-test="layout-options-content"] [data-test="layout-inset"]')).toBeTruthy();
  });

  it("shows a relative position inline once it has an inset", () => {
    const { selected, el } = makeSelected();
    mockComputedStyle({ display: "block", position: "relative", "z-index": "auto" });
    el.style.setProperty("top", "4px");
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-position"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-inset"]')).toBeTruthy();
  });

  it("shows position and z-index controls and writes z-index", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "relative", "z-index": "1" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-select-position"]')).toBeTruthy();
    const input = handle.host.querySelector('[data-test="layout-combo-input-z-index"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    setInputValue(input, "10");

    expect(sheetText()).toContain("z-index: 10;");
  });

  it("shows padding and margin together in the layout section", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "static" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="spacing-margin"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="spacing-padding"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-position"]')).toBeFalsy();
  });

  it("refreshes the inset controls after a position edit", () => {
    const { selected, el } = makeSelected();
    let position = "static";
    let editCount = 0;
    const original = window.getComputedStyle;
    (window as unknown as { getComputedStyle: typeof getComputedStyle }).getComputedStyle = ((target: Element) => {
      const base = original(target);
      const values = target === el ? { display: "block", position } : {};
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
        position = "absolute";
      },
    }));

    expect(handle.host.querySelector('[data-test="layout-inset"]')).toBeFalsy();

    act(() => (handle.host.querySelector('[data-test="layout-options"]') as HTMLButtonElement).click());
    setSelectValue(document.body.querySelector('[data-test="layout-select-position"]') as HTMLElement, "absolute");
    expect(handle.host.querySelector('[data-test="layout-inset"]')).toBeTruthy();
  });

  it("shows Grid child controls when the parent is a Grid container", () => {
    const { selected, el } = makeSelected();
    const parent = document.createElement("div");
    parent.appendChild(el);
    document.body.appendChild(parent);
    mockComputedStyle({
      display: "block",
      position: "static",
      "grid-column-start": "2",
      "grid-column-end": "span 2",
      "grid-row-start": "auto",
      "grid-row-end": "auto",
      "justify-self": "normal",
      "align-self": "normal",
    });

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
    act(() => (handle.host.querySelector('[data-test="layout-size-expand"]') as HTMLButtonElement).click());

    expect(handle.host.querySelector('[data-test="layout-grid-child"]')).toBeTruthy();
    expect((handle.host.querySelector('[data-test="layout-grid-child-column-start"]') as HTMLInputElement)?.value).toBe("2");
    expect(handle.host.querySelector('[data-test="layout-grid-child-row-start"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-grid-child-select-justify-self"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-grid-child-select-align-self"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-grid-child-fields"]')?.children).toHaveLength(4);
    expect(handle.host.querySelector('[data-test="layout-grid-child-settings"]')).toBeFalsy();
    expect(handle.host.querySelectorAll('[data-test^="layout-grid-child-action-"]')).toHaveLength(0);
    expect(handle.host.querySelector('[data-test="layout-grid-child"]')?.textContent).not.toContain("Computed preview");
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
    act(() => (handle.host.querySelector('[data-test="layout-size-expand"]') as HTMLButtonElement).click());

    expect(handle.host.querySelector('[data-test="layout-flex-child"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-flex-child-settings"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-select-align-self"]')).toBeFalsy();
    expect(handle.host.querySelectorAll('[data-test="layout-flex-child"] .field-row__label')).toHaveLength(3);
    expect(handle.host.querySelector('[data-test="layout-combo-input-flex-grow"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-combo-input-flex-shrink"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-combo-input-flex-basis"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-combo-select-flex-grow"]')).toBeFalsy();
    act(() => {
      (handle.host.querySelector('[data-test="layout-flex-child-settings"]') as HTMLButtonElement).click();
    });
    expect(document.body.querySelector('[data-test="layout-flex-child-settings-content"]')).toBeTruthy();
    expect(document.body.querySelector('[data-test="layout-select-align-self"]')).toBeTruthy();
    expect(document.body.querySelector('[data-test="layout-combo-select-order"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-flex-child"]')?.textContent)
      .not.toContain("Grow shares spare room");
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

  it("shows collapsible inset controls when position is absolute", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      display: "block",
      position: "absolute",
      top: "8px",
      right: "12px",
      bottom: "16px",
      left: "20px",
    });
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-inset"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-inset"][data-expanded="false"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-inset"] [data-test="pair-value-horizontal"]')).toBeTruthy();
    const toggle = handle.host.querySelector('[data-test="layout-inset"] [data-test="individual-sides"]') as HTMLButtonElement;
    expect(toggle.disabled).toBe(false);
    act(() => toggle.click());
    for (const side of ["top", "right", "bottom", "left"]) {
      expect(handle.host.querySelector(`[data-test="layout-inset"] [data-test="side-value-${side}"]`)).toBeTruthy();
    }
    expect(handle.host.querySelector('[data-test="layout-anchor-horizontal-start"]')).toBeNull();
    const topIcon = handle.host.querySelector('[data-test="layout-inset"] [data-side="top"] svg') as SVGSVGElement;
    expect(topIcon.classList.contains("side-values__side-icon")).toBe(true);
    expect(topIcon.querySelector("rect")?.getAttribute("x")).toBe("19");
  });

  it("shows auto for unauthored inset sides instead of the used pixel offset", () => {
    const { el, selected } = makeSelected();
    el.style.left = "0";
    mockComputedStyle({
      display: "block",
      position: "absolute",
      top: "30px",
      right: "107px",
      bottom: "40px",
      left: "0px",
    });
    handle = mount(createElement(LayoutSection, { element: selected }));
    act(() => {
      (handle.host.querySelector('[data-test="layout-inset"] [data-test="individual-sides"]') as HTMLButtonElement).click();
    });
    const sideInput = (side: string) =>
      (handle.host.querySelector(`[data-test="side-value-${side}"] [data-test="raw-input"]`) as HTMLInputElement).value;

    expect(sideInput("right")).toBe("auto");
    expect(sideInput("top")).toBe("auto");
    expect(sideInput("bottom")).toBe("auto");
    expect(sideInput("left")).toBe("0px");
  });

  it("shows flex child controls for a flex container inside a flex parent", () => {
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
    act(() => (handle.host.querySelector('[data-test="layout-size-expand"]') as HTMLButtonElement).click());

    expect(handle.host.querySelector('[data-test="layout-flex-child"]')).toBeTruthy();
  });

  it("writes an absolute position offset to managed stylesheet", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "flex", position: "absolute", "top": "0px" });
    handle = mount(createElement(LayoutSection, { element: selected }));

    act(() => {
      (handle.host.querySelector('[data-test="layout-inset"] [data-test="individual-sides"]') as HTMLButtonElement).click();
    });
    const input = handle.host.querySelector('[data-test="side-value-top"] [data-test="raw-input"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    setInputValue(input, "50%");

    expect(sheetText()).toContain("top: 50%;");
  });

  it("marks the size expander when a hidden size limit is set and clears the mark when it is not", () => {
    const { selected, el } = makeSelected();
    mockComputedStyle({ display: "block", position: "static" });
    handle = mount(createElement(LayoutSection, { element: selected }));
    const toggle = () => handle.host.querySelector('[data-test="layout-size-expand"]') as HTMLElement;
    expect(toggle().getAttribute("data-modified")).toBeNull();

    el.style.maxWidth = "640px";
    act(() => handle.root.render(createElement(LayoutSection, { element: selected })));
    expect(toggle().getAttribute("data-modified")).toBe("true");
  });

  it("marks the size expander for a non-default flex child and lists it only once expanded", () => {
    const { selected, el } = makeSelected();
    const parent = document.createElement("div");
    parent.appendChild(el);
    document.body.appendChild(parent);
    mockComputedStyle({ display: "block", position: "static", "flex-grow": "2", "flex-shrink": "1", "flex-basis": "auto", "align-self": "auto", order: "0" });
    const original = window.getComputedStyle;
    (window as unknown as { getComputedStyle: typeof getComputedStyle }).getComputedStyle = ((target: Element) => target === parent
      ? ({ display: "flex", getPropertyValue: () => "" } as unknown as CSSStyleDeclaration)
      : original(target)) as typeof getComputedStyle;
    handle = mount(createElement(LayoutSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-size-expand"]')?.getAttribute("data-modified")).toBe("true");
    expect(handle.host.querySelector('[data-test="layout-flex-child"]')).toBeFalsy();
  });

  it("sets position and z-index from the layout options and reveals them as a row once positioned", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "static" });
    handle = mount(createElement(LayoutSection, { element: selected }));
    expect(handle.host.querySelector('[data-test="layout-position"]')).toBeFalsy();

    act(() => (handle.host.querySelector('[data-test="layout-options"]') as HTMLButtonElement).click());
    expect(document.body.querySelector('[data-test="layout-select-position"]')).toBeTruthy();
    expect(document.body.querySelector('[data-test="layout-combo-input-z-index"]')).toBeTruthy();
  });

  describe("main-axis gap and distribution", () => {
    const flexRow = (justify: string) => ({
      display: "flex",
      position: "static",
      "flex-direction": "row",
      "flex-wrap": "nowrap",
      "justify-content": justify,
      "align-items": "flex-start",
      "column-gap": "16px",
      "row-gap": "0px",
    });
    const gapInput = () => handle.host.querySelector('[data-test="layout-combo-input-column-gap"]') as HTMLInputElement;

    it("reads Auto with the fixed gap beside it while the items are spread", () => {
      const { selected } = makeSelected();
      mockComputedStyle(flexRow("space-between"));
      handle = mount(createElement(LayoutSection, { element: selected }));

      expect(gapInput().value).toBe("Auto");
      expect(handle.host.querySelector('[data-test="layout-gap-value"]')?.textContent).toBe("16");
    });

    it("shows the gap number and no faint value while the items are grouped", () => {
      const { selected } = makeSelected();
      mockComputedStyle(flexRow("flex-start"));
      handle = mount(createElement(LayoutSection, { element: selected }));

      expect(gapInput().value).toBe("16px");
      expect(handle.host.querySelector('[data-test="layout-gap-value"]')).toBeNull();
    });

    it("spreads between when auto is typed, without changing the gap", () => {
      const { selected } = makeSelected();
      mockComputedStyle(flexRow("flex-start"));
      handle = mount(createElement(LayoutSection, { element: selected }));

      setInputValue(gapInput(), "auto");

      expect(sheetText()).toContain("justify-content: space-between;");
      expect(sheetText()).not.toContain("column-gap");
    });

    it("takes the items out of a spread when a gap value is typed", () => {
      const { selected } = makeSelected();
      mockComputedStyle(flexRow("space-around"));
      handle = mount(createElement(LayoutSection, { element: selected }));

      setInputValue(gapInput(), "24px");

      expect(sheetText()).toContain("column-gap: 24px;");
      expect(sheetText()).toContain("justify-content: flex-start;");
    });

    it.each([
      ["justify-content", (el: HTMLElement) => el.style.setProperty("justify-content", "space-between")],
      ["place-content", (el: HTMLElement) => el.style.setProperty("place-content", "center space-between")],
    ])("still saves a typed gap when %s is authored inline", (_property, authorInline) => {
      const { selected, el } = makeSelected();
      authorInline(el);
      mockComputedStyle(flexRow("space-between"));
      handle = mount(createElement(LayoutSection, { element: selected }));

      setInputValue(gapInput(), "24px");

      expect(sheetText()).toContain("column-gap: 24px;");
      expect(sheetText()).not.toContain("justify-content");
    });

    it("leaves the distribution alone when auto is typed while justify-content is authored inline", () => {
      const { selected, el } = makeSelected();
      el.style.setProperty("justify-content", "flex-start");
      mockComputedStyle(flexRow("flex-start"));
      handle = mount(createElement(LayoutSection, { element: selected }));

      setInputValue(gapInput(), "auto");

      expect(sheetText()).not.toContain("justify-content: space-between");
      expect((handle.host.querySelector('[data-test="layout-flex-distribution"]') as HTMLButtonElement).disabled).toBe(true);
    });

    it("offers every spread option from the chevron menu and groups the items again", () => {
      const { selected } = makeSelected();
      mockComputedStyle(flexRow("flex-start"));
      handle = mount(createElement(LayoutSection, { element: selected }));

      act(() => (handle.host.querySelector('[data-test="layout-flex-distribution"]') as HTMLButtonElement).click());
      for (const option of ["packed", "space-between", "space-around", "space-evenly"]) {
        expect(document.body.querySelector(`[data-test="layout-flex-distribution-${option}"]`)).toBeTruthy();
      }
      act(() => (document.body.querySelector('[data-test="layout-flex-distribution-space-evenly"]') as HTMLElement).click());

      expect(sheetText()).toContain("justify-content: space-evenly;");
    });
  });
});
