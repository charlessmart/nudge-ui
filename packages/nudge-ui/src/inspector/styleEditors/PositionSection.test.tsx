// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { PositionSection } from "./PositionSection.tsx";
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

describe("PositionSection", () => {
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

  it("shows position and z-index controls and writes z-index", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "relative", "z-index": "auto" });
    handle = mount(createElement(PositionSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-select-position"]')).toBeTruthy();
    const input = handle.host.querySelector('[data-test="layout-combo-input-z-index"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    setInputValue(input, "10");

    expect(sheetText()).toContain("z-index: 10;");
  });

  it("shows margin in the position section and not padding", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", position: "static" });
    handle = mount(createElement(PositionSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="spacing-margin"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="spacing-padding"]')).toBeFalsy();
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

    handle = mount(createElement(PositionSection, {
      element: selected,
      onAfterEdit: () => {
        editCount += 1;
        position = "absolute";
      },
    }));

    expect(handle.host.querySelector('[data-test="layout-inset"]')).toBeFalsy();

    setSelectValue(handle.host.querySelector('[data-test="layout-select-position"]') as HTMLElement, "absolute");
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

    handle = mount(createElement(PositionSection, { element: selected }));

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

    handle = mount(createElement(PositionSection, { element: selected }));

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

    handle = mount(createElement(PositionSection, { element: selected }));

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
    handle = mount(createElement(PositionSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-inset"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="layout-inset"][data-expanded="false"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="pair-value-horizontal"]')).toBeTruthy();
    const toggle = handle.host.querySelector('[data-test="individual-sides"]') as HTMLButtonElement;
    expect(toggle.disabled).toBe(false);
    act(() => toggle.click());
    for (const side of ["top", "right", "bottom", "left"]) {
      expect(handle.host.querySelector(`[data-test="side-value-${side}"]`)).toBeTruthy();
    }
    expect(handle.host.querySelector('[data-test="layout-anchor-horizontal-start"]')).toBeNull();
    const topIcon = handle.host.querySelector('[data-side="top"] svg') as SVGSVGElement;
    expect(topIcon.classList.contains("side-values__side-icon")).toBe(true);
    expect(topIcon.querySelector("rect")?.getAttribute("x")).toBe("19");
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

    handle = mount(createElement(PositionSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-flex-child"]')).toBeTruthy();
  });

  it("writes an absolute position offset to managed stylesheet", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "flex", position: "absolute", "top": "0px" });
    handle = mount(createElement(PositionSection, { element: selected }));

    act(() => {
      (handle.host.querySelector('[data-test="layout-inset"] [data-test="individual-sides"]') as HTMLButtonElement).click();
    });
    const input = handle.host.querySelector('[data-test="side-value-top"] [data-test="raw-input"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    setInputValue(input, "50%");

    expect(sheetText()).toContain("top: 50%;");
  });
});
