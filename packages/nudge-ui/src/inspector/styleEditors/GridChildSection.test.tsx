// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement, useState } from "react";
import { GridChildSection } from "./GridChildSection.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import {
  makeSelected,
  mockComputedStyle,
  mount,
  restoreComputedStyle,
  setInputValue,
  sheetText,
  publishInspection,
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
      publishInspection(el);
      return createElement(GridChildSection, {
        domElement: el,
        revision,
        onAfterEdit: () => setRevision((current) => current + 1),
      });
    }
    handle = mount(createElement(Harness));
    return { el };
  }

  function startInput(axis: string): HTMLInputElement {
    return handle!.host.querySelector(`[data-test="layout-grid-child-${axis}-start"]`) as HTMLInputElement;
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

  it("reads placement values and normal alignment from computed CSS", () => {
    mountSection({
      "grid-column-start": "2",
      "grid-column-end": "span 2",
      "grid-row-start": "auto",
      "grid-row-end": "auto",
      "justify-self": "normal",
      "align-self": "normal",
    });

    expect(startInput("column").value).toBe("2");
    expect(startInput("row").value).toBe("auto");
    expect(handle!.host.querySelector('[data-test="layout-grid-child-align-h-stretch"]')?.getAttribute("aria-pressed"))
      .toBe("true");
  });

  it("leaves alignment unselected when the child uses the parent default", () => {
    mountSection({
      "justify-self": "auto",
      "align-self": "auto",
    });

    expect(handle!.host.querySelectorAll('[data-test^="layout-grid-child-align-h-"][aria-pressed="true"]')).toHaveLength(0);
    expect(handle!.host.querySelectorAll('[data-test^="layout-grid-child-align-v-"][aria-pressed="true"]')).toHaveLength(0);
  });

  it("commits a start line as a managed longhand", () => {
    mountSection({ "grid-column-start": "auto" });

    setInputValue(startInput("column"), "1");

    expect(sheetText()).toContain("grid-column-start: 1;");
  });

  it("commits auto when a placement input is cleared", () => {
    mountSection({ "grid-column-start": "2" });

    setInputValue(startInput("column"), "");

    expect(sheetText()).toContain("grid-column-start: auto;");
  });

  it("keeps the derived span when the start line moves", () => {
    mountSection({
      "grid-column-start": "2",
      "grid-column-end": "4",
    });

    setInputValue(startInput("column"), "3");

    expect(sheetText()).toContain("grid-column-start: 3;");
    expect(sheetText()).toContain("grid-column-end: span 2;");
  });

  it("commits friendly alignment labels as self-alignment longhands", () => {
    mountSection({});

    act(() => {
      (handle!.host.querySelector('[data-test="layout-grid-child-align-v-center"]') as HTMLButtonElement).click();
    });

    expect(sheetText()).toContain("align-self: center;");
  });

  it("returns an edited alignment to the parent default when its selected option is clicked again", () => {
    mountSection({ "align-self": "auto" });

    act(() => {
      (handle!.host.querySelector('[data-test="layout-grid-child-align-v-center"]') as HTMLButtonElement).click();
    });
    expect(sheetText()).toContain("align-self: center;");
    expect(handle!.host.querySelector('[data-test="layout-grid-child-align-v-center"]')?.getAttribute("aria-pressed"))
      .toBe("true");

    act(() => {
      (handle!.host.querySelector('[data-test="layout-grid-child-align-v-center"]') as HTMLButtonElement).click();
    });

    expect(sheetText()).not.toContain("align-self: center;");
    expect(handle!.host.querySelectorAll('[data-test^="layout-grid-child-align-v-"][aria-pressed="true"]')).toHaveLength(0);
  });

  function typeWithoutBlur(input: HTMLInputElement, value: string): void {
    act(() => {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, value);
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  it("keeps a typed start line when the computed placement changes underneath", () => {
    mockComputedStyle({ "grid-column-start": "2" });
    const { el } = makeSelected("First");
    const render = (revision: number) => createElement(GridChildSection, { domElement: el, revision });
    handle = mount(render(0));
    const input = startInput("column");

    typeWithoutBlur(input, "3");
    mockComputedStyle({ "grid-column-start": "4" });
    act(() => handle!.root.render(render(1)));

    expect(input.value).toBe("3");
    act(() => input.blur());
    expect(sheetText()).toContain("grid-column-start: 3;");
  });

  it("drops a typed start line when the target element changes", () => {
    mockComputedStyle({ "grid-column-start": "2" });
    const { el: first } = makeSelected("First");
    const { el: second } = makeSelected("Second");
    const render = (el: HTMLElement) => createElement(GridChildSection, { domElement: el });
    handle = mount(render(first));
    const input = startInput("column");

    typeWithoutBlur(input, "3");
    mockComputedStyle({ "grid-column-start": "5" });
    act(() => handle!.root.render(render(second)));

    expect(input.value).toBe("5");
    act(() => input.blur());
    expect(sheetText()).not.toContain("grid-column-start: 3;");
  });
});
