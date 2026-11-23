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
    expect(raw.value).toBe("400");
    setInputValue(raw, "650");
    expect(sheetText()).toContain("font-weight: 650;");
    expect(sheetText()).not.toContain("font-style");
  });

  it("toggles italic as font-style only, keeping its source metadata", () => {
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
    const toggle = handle.host.querySelector('[data-test="font-style-italic"]') as HTMLButtonElement;
    expect(toggle.getAttribute("aria-pressed")).toBe("false");

    act(() => toggle.click());

    expect(sheetText()).toContain("font-style: italic;");
    expect(sheetText()).not.toContain("font-weight");
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(getChangeRecords().at(-1)).toMatchObject({ sourceProperty: "font-style", sourceAuthoredValue: "normal" });
  });

  it("marks a mixed italic selection and makes every element italic from it", () => {
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
      const toggle = handle.host.querySelector('[data-test="font-style-italic"]') as HTMLButtonElement;
      expect(handle.host.querySelector('[data-test="typography-mixed-font-style"]')?.textContent).toBe("Mixed");
      expect(toggle.getAttribute("aria-pressed")).toBe("false");

      act(() => toggle.click());
      expect(sheetText()).toContain("font-style: italic;");
      // The element that was already italic needs no change.
      expect(getChangeRecords()).toHaveLength(1);
      expect(toggle.getAttribute("aria-pressed")).toBe("true");
      expect(handle.host.querySelector('[data-test="typography-mixed-font-style"]')).toBeNull();
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
    const toggle = handle.host.querySelector('[data-test="font-style-italic"]') as HTMLButtonElement;
    expect(toggle.getAttribute("aria-pressed")).toBe("true");

    restoreComputedStyle();
    mockComputedStyle({ "font-style": "normal" });
    act(() => handle.root.render(createElement(Typography, { element: selected, tokenRows: [row("normal")] })));
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
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
