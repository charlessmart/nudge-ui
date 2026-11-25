// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { Typography } from "./Typography.tsx";
import { getChangeRecords, resetPendingRules } from "../tokens/editActions.ts";
import {
  makeMixedStyleSelection,
  makeSelected,
  mount,
  setInputValue,
  setSelectValue,
  mockComputedStyle,
  restoreComputedStyle,
  sheetText,
  type MountHandle,
} from "./_testUtils.ts";

describe("Typography", () => {
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

  it("focuses the font family input from its chevron", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "font-family": "Inter" });
    handle = mount(createElement(Typography, { element: selected, entries: [] }));
    const field = handle.host.querySelector('[data-test="token-field"][data-property="font-family"]')!;
    const chevron = field.querySelector<HTMLElement>('[data-test="token-field-trailing"]')!;
    const event = new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 });
    act(() => { chevron.dispatchEvent(event); });
    expect(event.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(field.querySelector("input"));
  });

  it("writes font-size via the raw input", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "font-size": "16px",
      "font-weight": "400",
      "line-height": "1.5",
      "letter-spacing": "0px",
    });
    handle = mount(createElement(Typography, { element: selected }));
    const tokenField = handle.host.querySelector('[data-test="token-field"][data-property="font-size"]');
    const raw = tokenField!.querySelector('[data-test="raw-input"]') as HTMLInputElement;
    setInputValue(raw, "18px");
    expect(sheetText()).toContain("font-size: 18px;");
  });

  it("writes a variable font weight through the raw input", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "font-weight": "400", "font-style": "normal" });
    handle = mount(createElement(Typography, { element: selected }));
    const raw = handle.host.querySelector('[data-test="token-field"][data-property="font-weight"] [data-test="raw-input"]') as HTMLInputElement;
    expect(raw.value).toBe("Regular");
    setInputValue(raw, "650");
    expect(sheetText()).toContain("font-weight: 650;");
    expect(sheetText()).not.toContain("font-style");
    expect(raw.value).toBe("650");
  });

  it("writes a typed weight name as its number and shows the name", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "font-weight": "400" });
    handle = mount(createElement(Typography, { element: selected }));
    const raw = handle.host.querySelector('[data-test="token-field"][data-property="font-weight"] [data-test="raw-input"]') as HTMLInputElement;
    setInputValue(raw, "semi-bold");
    expect(sheetText()).toContain("font-weight: 600;");
    expect(raw.value).toBe("Semibold");
  });

  it("nudges a named weight by its number", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "font-weight": "400" });
    handle = mount(createElement(Typography, { element: selected }));
    const raw = handle.host.querySelector('[data-test="token-field"][data-property="font-weight"] [data-test="raw-input"]') as HTMLInputElement;
    act(() => raw.focus());
    act(() => { raw.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true })); });
    expect(sheetText()).toContain("font-weight: 500;");
    expect(raw.value).toBe("Medium");
  });

  it("opens the named weights from the weight field's chevron", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "font-weight": "400" });
    handle = mount(createElement(Typography, { element: selected }));
    const field = handle.host.querySelector('[data-test="token-field"][data-property="font-weight"]')!;
    const chevron = field.querySelector<HTMLElement>('[data-test="token-field-trailing"]')!;
    act(() => { chevron.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 })); });
    const items = Array.from(document.body.querySelectorAll('[data-test="raw-suggestion-item"]')).map((item) => item.textContent);
    expect(items).toEqual(["Light", "Regular", "Medium", "Semibold", "Bold"]);

    const bold = Array.from(document.body.querySelectorAll<HTMLElement>('[data-test="raw-suggestion-item"]')).find((item) => item.textContent === "Bold")!;
    act(() => {
      bold.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      bold.click();
    });
    expect(sheetText()).toContain("font-weight: 700;");
  });

  function openTextOptions(): void {
    act(() => (handle.host.querySelector('[data-test="typography-options"]') as HTMLButtonElement).click());
  }

  function segment(property: string, value: string): HTMLButtonElement {
    return document.body.querySelector(`[data-test="typography-${property}-${value}"]`) as HTMLButtonElement;
  }

  function pressed(property: string, value: string): string | null {
    return segment(property, value).getAttribute("aria-pressed");
  }

  it("sets italic from the text options as font-style only, keeping its source metadata", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "font-weight": "400", "font-style": "normal" });
    handle = mount(createElement(Typography, {
      element: selected,
      tokenRows: [{
        property: "font-style",
        tokenName: null,
        declaredValue: "normal",
        authored: "normal",
        sourceProperty: "font-style",
        resolvedValue: "normal",
        confidence: "exact",
        evidence: { reason: "style fixture" },
      }],
    }));
    openTextOptions();
    expect(pressed("font-style", "normal")).toBe("true");

    act(() => segment("font-style", "italic").click());

    expect(sheetText()).toContain("font-style: italic;");
    expect(sheetText()).not.toContain("font-weight");
    expect(pressed("font-style", "italic")).toBe("true");
    expect(getChangeRecords().at(-1)).toMatchObject({ sourceProperty: "font-style", sourceAuthoredValue: "normal" });
  });

  it("marks a mixed font style and makes every element italic from it", () => {
    const style = document.createElement("style");
    style.textContent = ".slanted { font-style: italic; }";
    document.head.append(style);
    const first = makeSelected("Heading", "src/Heading.tsx:1:1");
    const second = makeSelected("Heading", "src/Heading.tsx:2:1");
    second.el.classList.add("slanted");
    const selection = {
      ...makeMixedStyleSelection(first.selected, "font-style"),
      elements: [first.selected, second.selected],
      domElements: [first.el, second.el],
      target: [first.el, second.el],
    };
    try {
      handle = mount(createElement(Typography, { element: first.selected, selection }));
      openTextOptions();
      expect(document.body.querySelector('[data-test="typography-mixed-font-style"]')?.textContent).toBe("Mixed");
      expect(pressed("font-style", "normal")).toBe("false");
      expect(pressed("font-style", "italic")).toBe("false");

      act(() => segment("font-style", "italic").click());
      expect(sheetText()).toContain("font-style: italic;");
      // The element that was already italic needs no change.
      expect(getChangeRecords()).toHaveLength(1);
    } finally {
      style.remove();
    }
  });

  it("follows a font-style change made elsewhere, such as an undo", () => {
    const { selected } = makeSelected();
    const row = (value: string) => ({
      property: "font-style",
      tokenName: null,
      declaredValue: value,
      authored: value,
      sourceProperty: "font-style",
      resolvedValue: value,
      confidence: "exact" as const,
      evidence: { reason: "style fixture" },
    });
    mockComputedStyle({ "font-style": "italic" });
    handle = mount(createElement(Typography, { element: selected, tokenRows: [row("italic")] }));
    openTextOptions();
    expect(pressed("font-style", "italic")).toBe("true");

    restoreComputedStyle();
    mockComputedStyle({ "font-style": "normal" });
    act(() => handle.root.render(createElement(Typography, { element: selected, tokenRows: [row("normal")] })));
    expect(pressed("font-style", "normal")).toBe("true");
  });

  it("truncates to one line from the text options", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ display: "block", overflow: "visible", "text-overflow": "clip", "white-space": "normal" });
    handle = mount(createElement(Typography, { element: selected }));
    openTextOptions();
    const truncate = document.body.querySelector('[data-test="typography-select-truncate"]') as HTMLElement;
    expect(truncate.querySelector(".select__value")?.textContent).toBe("None");

    setSelectValue(truncate, "1");

    expect(sheetText()).toContain("overflow: hidden;");
    expect(sheetText()).toContain("text-overflow: ellipsis;");
    expect(sheetText()).toContain("white-space: nowrap;");
  });

  it("lists each text option as a label beside its control", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "text-decoration-line": "none", "text-transform": "none", "white-space": "normal" });
    handle = mount(createElement(Typography, { element: selected }));
    openTextOptions();
    const labels = Array.from(document.body.querySelectorAll('[data-test="typography-options-content"] .typography__option-label'))
      .map((label) => label.textContent);
    expect(labels).toEqual(["Style", "Decoration", "Case", "Vertical trim", "Wrap", "Truncate"]);

    expect(pressed("text-decoration-line", "none")).toBe("true");
    act(() => segment("text-decoration-line", "underline").click());
    expect(sheetText()).toContain("text-decoration-line: underline;");
    expect(pressed("text-transform", "none")).toBe("true");
    act(() => segment("text-transform", "uppercase").click());
    expect(sheetText()).toContain("text-transform: uppercase;");
  });

  it("balances wrapping from the wrap choices", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "text-wrap-mode": "wrap", "text-wrap-style": "auto" });
    handle = mount(createElement(Typography, { element: selected }));
    openTextOptions();
    const wrap = document.body.querySelector('[data-test="typography-select-wrap"]') as HTMLElement;
    expect(wrap.querySelector(".select__value")?.textContent).toBe("Normal");
    act(() => {
      wrap.focus();
      wrap.click();
    });
    expect(Array.from(document.body.querySelectorAll(".select__item-description")).map((line) => line.textContent))
      .toEqual(["No wrapping", "Default wrapping", "Avoids orphans", "Spreads text evenly"]);
    expect(document.body.querySelectorAll(".select__separator")).toHaveLength(1);

    const balance = document.body.querySelector('.select__item[data-value="balance"]') as HTMLElement;
    act(() => {
      balance.dispatchEvent(new Event("pointerdown", { bubbles: true }));
      balance.click();
    });

    expect(sheetText()).toContain("text-wrap: balance;");
  });

  it("trims the text box to the cap height and baseline where the browser supports it", () => {
    const original = globalThis.CSS;
    globalThis.CSS = { ...original, supports: () => true } as typeof CSS;
    try {
      const { selected } = makeSelected();
      mockComputedStyle({ "text-box-trim": "none" });
      handle = mount(createElement(Typography, { element: selected }));
      openTextOptions();
      expect(pressed("text-box-trim", "none")).toBe("true");

      act(() => segment("text-box-trim", "trim-both").click());

      expect(getChangeRecords().at(-1)).toMatchObject({ property: "text-box", rawValue: "trim-both cap alphabetic" });
    } finally {
      globalThis.CSS = original;
    }
  });

  it("disables vertical trim where the browser has no text-box", () => {
    const original = globalThis.CSS;
    globalThis.CSS = { ...original, supports: () => false } as typeof CSS;
    try {
      const { selected } = makeSelected();
      handle = mount(createElement(Typography, { element: selected }));
      openTextOptions();
      expect(segment("text-box-trim", "trim-both").disabled).toBe(true);
    } finally {
      globalThis.CSS = original;
    }
  });

  it("writes line-height via the raw input", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "font-size": "16px",
      "font-weight": "400",
      "line-height": "1.5",
      "letter-spacing": "0px",
    });
    handle = mount(createElement(Typography, { element: selected }));
    const tokenField = handle.host.querySelector('[data-test="token-field"][data-property="line-height"]');
    const raw = tokenField!.querySelector('[data-test="raw-input"]') as HTMLInputElement;
    setInputValue(raw, "1.6");
    expect(sheetText()).toContain("line-height: 160%;");
  });

  it("writes letter-spacing via the raw input", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "font-size": "16px",
      "font-weight": "400",
      "line-height": "1.5",
      "letter-spacing": "0.05em",
    });
    handle = mount(createElement(Typography, { element: selected }));
    const tokenField = handle.host.querySelector('[data-test="token-field"][data-property="letter-spacing"]');
    const raw = tokenField!.querySelector('[data-test="raw-input"]') as HTMLInputElement;
    expect(raw.value).toBe("0.05em");
    setInputValue(raw, "1em");
    expect(sheetText()).toContain("letter-spacing: 1em;");
  });

  it("writes text alignment through the icon control", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "text-align": "left", "vertical-align": "baseline" });
    handle = mount(createElement(Typography, { element: selected }));
    const center = handle.host.querySelector('[data-test="typography-align-text-align-center"]') as HTMLButtonElement;
    act(() => center.click());
    expect(sheetText()).toContain("text-align: center;");
  });

  it("keeps text alignment selected when its active option is clicked again", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "text-align": "left", "vertical-align": "baseline" });
    handle = mount(createElement(Typography, { element: selected }));
    const center = handle.host.querySelector('[data-test="typography-align-text-align-center"]') as HTMLButtonElement;

    act(() => center.click());
    expect(sheetText()).toContain("text-align: center;");

    act(() => center.click());

    expect(sheetText()).toContain("text-align: center;");
    expect(handle.host.querySelector('[data-test="typography-align-text-align-center"]')?.getAttribute("aria-pressed"))
      .toBe("true");
  });

  it("records font shorthand provenance when a decomposed longhand is edited", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "font-size": "20px" });
    handle = mount(createElement(Typography, {
      element: selected,
      tokenRows: [{
        property: "font-size",
        tokenName: null,
        declaredValue: "1.25rem",
        authored: "1.25rem",
        sourceProperty: "font",
        resolvedValue: "20px",
        computed: "20px",
        capability: "atomic",
        confidence: "unknown",
        evidence: { reason: "font shorthand test fixture" },
      }],
    }));
    const raw = handle.host.querySelector('[data-test="token-field"][data-property="font-size"] [data-test="raw-input"]') as HTMLInputElement;
    expect(raw.value).toBe("1.25rem");
    setInputValue(raw, "24px");

    expect(sheetText()).toContain("font-size: 24px;");
    expect(getChangeRecords().at(-1)).toMatchObject({ sourceProperty: "font", sourceAuthoredValue: "1.25rem" });
  });

  it("shows Mixed and writes a shared font size to every selected element", () => {
    const first = makeSelected("Heading", "src/Heading.tsx:1:1");
    const second = makeSelected("Heading", "src/Heading.tsx:2:1");
    mockComputedStyle({ "font-size": "24px" });
    const selection = {
      ...makeMixedStyleSelection(first.selected, "font-size"),
      elements: [first.selected, second.selected],
      domElements: [first.el, second.el],
      target: [first.el, second.el],
    };
    handle = mount(createElement(Typography, {
      element: first.selected,
      selection,
    }));

    const raw = handle.host.querySelector('[data-test="token-field"][data-property="font-size"] [data-test="raw-input"]') as HTMLInputElement;
    expect(raw.value).toBe("Mixed");
    setInputValue(raw, "28px");

    expect(sheetText()).toContain("font-size: 28px;");
    expect(getChangeRecords()).toHaveLength(2);
  });
});
