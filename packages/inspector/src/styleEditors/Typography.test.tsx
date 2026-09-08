// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { Typography } from "./Typography.tsx";
import { getChangeRecords, resetPendingRules } from "../tokens/editActions.ts";
import {
  makeSelected,
  mount,
  setSelectValue,
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

  it("renders a TokenField for font-size in raw mode by default", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "font-size": "16px",
      "font-weight": "400",
      "line-height": "1.5",
      "letter-spacing": "0px",
    });
    handle = mount(createElement(Typography, { element: selected }));
    const tokenField = handle.host.querySelector('[data-test="token-field"][data-property="font-size"]');
    expect(tokenField).toBeTruthy();
    const raw = tokenField!.querySelector('[data-test="raw-input"]') as HTMLInputElement;
    expect(raw).toBeTruthy();
    expect(raw.value).toBe("16px");
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

  it("writes font style presets as font-style and font-weight", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "font-size": "16px",
      "font-weight": "400",
      "font-style": "normal",
      "line-height": "1.5",
      "letter-spacing": "0px",
    });
    handle = mount(createElement(Typography, { element: selected }));
    const select = handle.host.querySelector('[data-test="font-style-field"]') as HTMLElement;
    setSelectValue(select, "700-italic");
    expect(sheetText()).toContain("font-style: italic;");
    expect(sheetText()).toContain("font-weight: 700;");
  });

  it("keeps separate source metadata for font style and weight", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "font-weight": "400",
      "font-style": "normal",
    });
    handle = mount(createElement(Typography, {
      element: selected,
      tokenRows: [
        {
          property: "font-style",
          tokenName: null,
          declaredValue: "normal",
          authored: "normal",
          sourceProperty: "font-style",
          resolvedValue: "normal",
          confidence: "exact",
          evidence: { reason: "style fixture" },
        },
        {
          property: "font-weight",
          tokenName: null,
          declaredValue: "var(--weight-body)",
          authored: "var(--weight-body)",
          sourceProperty: "font-weight",
          resolvedValue: "400",
          confidence: "exact",
          evidence: { reason: "weight fixture" },
        },
      ],
    }));

    setSelectValue(handle.host.querySelector('[data-test="font-style-field"]') as HTMLElement, "700-italic");

    expect(getChangeRecords().find((record) => record.property === "font-style")).toMatchObject({
      sourceProperty: "font-style",
      sourceAuthoredValue: "normal",
    });
    expect(getChangeRecords().find((record) => record.property === "font-weight")).toMatchObject({
      sourceProperty: "font-weight",
      sourceAuthoredValue: "var(--weight-body)",
    });
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

  it("renders the compact typography field groups", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "font-size": "16px",
      "font-weight": "400",
      "line-height": "1.5",
      "letter-spacing": "0px",
    });
    handle = mount(createElement(Typography, { element: selected }));
    for (const prop of ["font-size", "line-height", "letter-spacing", "font-family"]) {
      expect(handle.host.querySelector(`[data-test="token-field"][data-property="${prop}"]`)).toBeTruthy();
    }
    expect(handle.host.querySelector('[data-test="font-style-field"]')).toBeTruthy();
    expect(handle.host.querySelectorAll('[data-test="typography-align-text-align-left"], [data-test="typography-align-vertical-align-top"]')).toHaveLength(2);
    const alignmentIcons = handle.host.querySelectorAll('[data-test^="typography-align-"] svg');
    expect(alignmentIcons).toHaveLength(6);
    for (const icon of alignmentIcons) {
      expect(icon.getAttribute("width")).toBe("var(--icon-size-small)");
      expect(icon.getAttribute("height")).toBe("var(--icon-size-small)");
      expect(icon.getAttribute("stroke-width")).toBe("var(--icon-stroke-width)");
    }
  });

  it("writes text alignment through the icon control", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "text-align": "left", "vertical-align": "baseline" });
    handle = mount(createElement(Typography, { element: selected }));
    const center = handle.host.querySelector('[data-test="typography-align-text-align-center"]') as HTMLButtonElement;
    act(() => center.click());
    expect(sheetText()).toContain("text-align: center;");
  });

  it("returns text alignment to its original value when its selected option is clicked again", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "text-align": "left", "vertical-align": "baseline" });
    handle = mount(createElement(Typography, { element: selected }));
    const center = handle.host.querySelector('[data-test="typography-align-text-align-center"]') as HTMLButtonElement;

    act(() => center.click());
    expect(sheetText()).toContain("text-align: center;");

    act(() => center.click());

    expect(sheetText()).not.toContain("text-align: center;");
    expect(handle.host.querySelectorAll('[data-test^="typography-align-text-align-"][aria-pressed="true"]')).toHaveLength(0);
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
    handle = mount(createElement(Typography, {
      element: first.selected,
      elements: [first.selected, second.selected],
      tokenRows: [{
        property: "font-size",
        tokenName: null,
        declaredValue: "Mixed",
        resolvedValue: "Mixed",
        authored: "Mixed",
        confidence: "exact",
        evidence: { reason: "aggregate test" },
        aggregate: {
          valueState: "mixed",
          tokenState: "common",
          values: ["24px", "20px"],
          tokenNames: [null, null],
          rows: [],
        },
      }],
    }));

    const raw = handle.host.querySelector('[data-test="token-field"][data-property="font-size"] [data-test="raw-input"]') as HTMLInputElement;
    expect(raw.value).toBe("Mixed");
    setInputValue(raw, "28px");

    expect(sheetText()).toContain("font-size: 28px;");
    expect(getChangeRecords()).toHaveLength(2);
  });
});
