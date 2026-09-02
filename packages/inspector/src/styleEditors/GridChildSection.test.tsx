// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createElement, useState } from "react";
import { GridChildSection } from "./GridChildSection.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import {
  makeSelected,
  mockComputedStyle,
  mount,
  restoreComputedStyle,
  setSelectValue,
  sheetText,
  type MountHandle,
} from "./_testUtils.ts";

describe("GridChildSection", () => {
  let handle: MountHandle | null = null;

  function mountSection(values: Record<string, string>) {
    const { el } = makeSelected();
    mockComputedStyle(values);
    // Wrap with a live revision so edits re-read state like LayoutSection does.
    function Harness(): React.ReactElement {
      const [revision, setRevision] = useState(0);
      return createElement(GridChildSection, {
        domElement: el,
        revision,
        onAfterEdit: () => setRevision((current) => current + 1),
      });
    }
    handle = mount(createElement(Harness));
    return { el };
  }

  function startSelect(axis: string): HTMLElement {
    return handle!.host.querySelector(`[data-test="layout-grid-child-${axis}-start"]`) as HTMLElement;
  }

  function startSelectValue(axis: string): string {
    return startSelect(axis).querySelector(".select__value")?.textContent ?? "";
  }

  beforeEach(() => {
    resetPendingRules();
    document.getElementById("nudge-ui-styles")?.remove();
    document.body.innerHTML = "";
  });

  afterEach(() => {
    handle?.unmount();
    handle = null;
    restoreComputedStyle();
    resetPendingRules();
    document.getElementById("nudge-ui-styles")?.remove();
    document.body.innerHTML = "";
  });

  it("renders placement, alignment, and quick actions", () => {
    mountSection({
      "grid-column-start": "2",
      "grid-column-end": "span 2",
      "grid-row-start": "auto",
      "grid-row-end": "auto",
      "justify-self": "normal",
      "align-self": "normal",
    });

    expect(handle!.host.querySelector('[data-test="layout-grid-child"]')).toBeTruthy();
    expect(startSelectValue("column")).toBe("2");
    const columnSpan = handle!.host.querySelector('[data-test="layout-grid-child-column-span-value"]') as HTMLInputElement;
    expect(columnSpan.value).toBe("2");
    expect(startSelectValue("row")).toBe("Auto");
    const rowSpan = handle!.host.querySelector('[data-test="layout-grid-child-row-span-value"]') as HTMLInputElement;
    expect(rowSpan.value).toBe("");

    const actions = handle!.host.querySelectorAll('[data-test^="layout-grid-child-action-"]');
    expect(actions).toHaveLength(4);
    expect(handle!.host.querySelector('[data-test="layout-grid-child-select-justify-self"] .select__value')?.textContent)
      .toBe("Parent default");
  });

  it("marks quick actions active when their state matches", () => {
    mountSection({
      "grid-column-start": "1",
      "grid-column-end": "-1",
      "justify-self": "stretch",
      "align-self": "stretch",
    });

    expect(handle!.host.querySelector('[data-test="layout-grid-child-action-full-width"]')?.getAttribute("data-active")).toBe("true");
    expect(handle!.host.querySelector('[data-test="layout-grid-child-action-fill"]')?.getAttribute("data-active")).toBe("true");
    expect(handle!.host.querySelector('[data-test="layout-grid-child-action-center"]')?.getAttribute("data-active")).toBeNull();
  });

  it("commits a start line as a managed longhand", () => {
    mountSection({ "grid-column-start": "auto" });

    setSelectValue(startSelect("column"), "1");

    expect(sheetText()).toContain("grid-column-start: 1;");
  });

  it("keeps the derived span when the start line moves", () => {
    mountSection({
      "grid-column-start": "2",
      "grid-column-end": "4",
    });

    setSelectValue(startSelect("column"), "3");

    expect(sheetText()).toContain("grid-column-start: 3;");
    expect(sheetText()).toContain("grid-column-end: span 2;");
  });

  it("commits a span from the stepper", () => {
    mountSection({
      "grid-row-start": "1",
      "grid-row-end": "span 1",
    });

    const increment = handle!.host.querySelector('[data-test="layout-grid-child-row-span-increment"]') as HTMLButtonElement;
    act(() => {
      increment.click();
    });

    expect(sheetText()).toContain("grid-row-end: span 2;");
  });

  it("commits quick actions as managed declarations", () => {
    mountSection({});

    act(() => {
      (handle!.host.querySelector('[data-test="layout-grid-child-action-full-width"]') as HTMLButtonElement).click();
    });
    expect(sheetText()).toContain("grid-column: 1 / -1;");

    act(() => {
      (handle!.host.querySelector('[data-test="layout-grid-child-action-center"]') as HTMLButtonElement).click();
    });
    expect(sheetText()).toContain("justify-self: center;");
    expect(sheetText()).toContain("align-self: center;");
  });

  it("commits friendly alignment labels as self-alignment longhands", () => {
    mountSection({});

    setSelectValue(handle!.host.querySelector('[data-test="layout-grid-child-select-align-self"]') as HTMLElement, "center");

    expect(sheetText()).toContain("align-self: center;");
  });

  it("keeps raw shorthand editing in the advanced popover", () => {
    mountSection({});

    const trigger = handle!.host.querySelector('[data-test="layout-grid-child-settings"]') as HTMLButtonElement;
    act(() => {
      trigger.click();
    });

    const advanced = document.body.querySelector('[data-test="layout-grid-child-settings-popover"]');
    expect(advanced).toBeTruthy();
    expect(advanced?.querySelector('[data-test="layout-grid-input-grid-column"]')).toBeTruthy();
    expect(advanced?.querySelector('[data-test="layout-grid-input-grid-row"]')).toBeTruthy();
  });
});
