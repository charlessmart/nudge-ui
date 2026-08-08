// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { SpacingBox } from "./SpacingBox.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import type { ResolvedProperty } from "@design-tool/css/model";
import {
  makeSelected,
  mount,
  setInputValue,
  mockComputedStyle,
  restoreComputedStyle,
  sheetText,
  type MountHandle,
} from "./_testUtils.ts";

describe("SpacingBox", () => {
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

  function rawInput(prop: string): HTMLInputElement {
    const tokenField = handle.host.querySelector(
      `[data-test="token-field"][data-property="${prop}"]`,
    );
    return tokenField!.querySelector('[data-test="raw-input"]') as HTMLInputElement;
  }

  function showIndividualSides(property: "padding" | "margin"): void {
    act(() => {
      (handle.host.querySelector(`[data-test="spacing-${property}"] [data-test="individual-sides"]`) as HTMLButtonElement).click();
    });
  }

  it("renders horizontal and vertical padding controls by default", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "padding-top": "8px",
      "padding-right": "12px",
      "padding-bottom": "8px",
      "padding-left": "12px",
      "margin-top": "0px",
      "margin-right": "0px",
      "margin-bottom": "0px",
      "margin-left": "0px",
    });
    handle = mount(createElement(SpacingBox, { element: selected }));
    const padding = handle.host.querySelector('[data-test="spacing-padding"]') as HTMLElement;
    expect(padding.getAttribute("data-expanded")).toBe("false");
    expect(padding.querySelectorAll('[data-test^="pair-value-"]')).toHaveLength(2);
    expect(padding.querySelectorAll('[data-test^="side-value-"]')).toHaveLength(0);
    expect(rawInput("padding-horizontal").value).toBe("12px");
    expect(rawInput("padding-vertical").value).toBe("8px");
  });

  it("writes padding-top longhand on change", () => {
    const { el, selected } = makeSelected();
    mockComputedStyle({
      "padding-top": "0px",
      "padding-right": "0px",
      "padding-bottom": "0px",
      "padding-left": "0px",
      "margin-top": "0px",
      "margin-right": "0px",
      "margin-bottom": "0px",
      "margin-left": "0px",
    });
    handle = mount(createElement(SpacingBox, { element: selected }));
    showIndividualSides("padding");
    const pt = rawInput("padding-top");
    setInputValue(pt, "24px");
    expect(sheetText()).toContain('[data-cid="Button"][data-src="src/Button.tsx:1:1"]');
    expect(sheetText()).toContain("padding-top: 24px;");
    expect(el.style.paddingTop).toBe("");
  });

  it("writes margin-bottom longhand on change", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "padding-top": "0px",
      "padding-right": "0px",
      "padding-bottom": "0px",
      "padding-left": "0px",
      "margin-top": "0px",
      "margin-right": "0px",
      "margin-bottom": "0px",
      "margin-left": "0px",
    });
    handle = mount(createElement(SpacingBox, { element: selected }));
    showIndividualSides("margin");
    const mb = rawInput("margin-bottom");
    setInputValue(mb, "16px");
    expect(sheetText()).toContain("margin-bottom: 16px;");
  });

  it("shows computed value for non-px padding values", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "padding-top": "auto",
      "padding-right": "1rem",
      "padding-bottom": "",
      "padding-left": "8px",
      "margin-top": "0px",
      "margin-right": "0px",
      "margin-bottom": "0px",
      "margin-left": "0px",
    });
    handle = mount(createElement(SpacingBox, { element: selected }));
    showIndividualSides("padding");
    expect(rawInput("padding-top").value).toBe("auto");
    expect(rawInput("padding-right").value).toBe("1rem");
    expect(rawInput("padding-left").value).toBe("8px");
  });

  it("renders margin TokenFields for zero values", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "padding-top": "0px",
      "padding-right": "0px",
      "padding-bottom": "0px",
      "padding-left": "0px",
      "margin-top": "0px",
      "margin-right": "0px",
      "margin-bottom": "0px",
      "margin-left": "0px",
    });
    handle = mount(createElement(SpacingBox, { element: selected }));
    expect(handle.host.querySelector('[data-test="spacing-margin"][data-expanded="false"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="margin-horizontal"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="margin-vertical"]')).toBeTruthy();
    act(() => {
      (handle.host.querySelector('[data-test="spacing-margin"] [data-test="individual-sides"]') as HTMLButtonElement).click();
    });
    expect(handle.host.querySelector('[data-test="token-field"][data-property="margin-top"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="margin-right"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="margin-bottom"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="margin-left"]')).toBeTruthy();
  });

  it("keeps margin values editable in the grouped field", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "padding-top": "0px",
      "padding-right": "0px",
      "padding-bottom": "0px",
      "padding-left": "0px",
      "margin-top": "8px",
      "margin-right": "16px",
      "margin-bottom": "24px",
      "margin-left": "16px",
    });
    handle = mount(createElement(SpacingBox, { element: selected }));
    expect(handle.host.querySelector('[data-test="spacing-margin"][data-expanded="true"]')).toBeTruthy();
    expect(rawInput("margin-top").value).toBe("8px");
    expect(rawInput("margin-right").value).toBe("16px");
    expect(rawInput("margin-bottom").value).toBe("24px");
    expect(rawInput("margin-left").value).toBe("16px");
  });

  it("does not reuse a shorthand margin row for every side", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "padding-top": "0px",
      "padding-right": "0px",
      "padding-bottom": "0px",
      "padding-left": "0px",
      "margin-top": "8px",
      "margin-right": "16px",
      "margin-bottom": "24px",
      "margin-left": "16px",
    });
    const shorthandRow: ResolvedProperty = {
      property: "margin",
      tokenName: null,
      declaredValue: "8px 16px 24px",
      resolvedValue: "8px 16px 24px",
      confidence: "unknown",
      evidence: { reason: "test shorthand fixture" },
    };
    handle = mount(createElement(SpacingBox, { element: selected, tokenRows: [shorthandRow] }));

    showIndividualSides("margin");
    expect(rawInput("margin-top").value).toBe("8px");
    expect(rawInput("margin-right").value).toBe("16px");
    expect(rawInput("margin-bottom").value).toBe("24px");
    expect(rawInput("margin-left").value).toBe("16px");
  });

  it("writes both physical sides when a grouped control changes", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "padding-top": "8px",
      "padding-right": "8px",
      "padding-bottom": "8px",
      "padding-left": "8px",
      "margin-top": "0px",
      "margin-right": "0px",
      "margin-bottom": "0px",
      "margin-left": "0px",
      padding: "8px",
      margin: "0px",
    });
    handle = mount(createElement(SpacingBox, { element: selected }));
    setInputValue(rawInput("padding-horizontal"), "24px");
    expect(sheetText()).toContain("padding-left: 24px;");
    expect(sheetText()).toContain("padding-right: 24px;");
  });

  it("forces four-side mode when pair values are asymmetric", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "padding-top": "8px",
      "padding-right": "16px",
      "padding-bottom": "24px",
      "padding-left": "16px",
      "margin-top": "0px",
      "margin-right": "0px",
      "margin-bottom": "0px",
      "margin-left": "0px",
    });
    handle = mount(createElement(SpacingBox, { element: selected }));

    const padding = handle.host.querySelector('[data-test="spacing-padding"]') as HTMLElement;
    expect(padding.getAttribute("data-expanded")).toBe("true");
    expect(rawInput("padding-top").value).toBe("8px");
    expect(rawInput("padding-bottom").value).toBe("24px");
    expect((padding.querySelector('[data-test="individual-sides"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it("forces four-side mode when only one physical spacing side is set", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "padding-top": "16px",
      "padding-right": "0px",
      "padding-bottom": "0px",
      "padding-left": "0px",
      "margin-top": "0px",
      "margin-right": "0px",
      "margin-bottom": "12px",
      "margin-left": "0px",
    });
    handle = mount(createElement(SpacingBox, { element: selected }));

    const padding = handle.host.querySelector('[data-test="spacing-padding"]') as HTMLElement;
    expect(padding.getAttribute("data-expanded")).toBe("true");
    expect(padding.querySelectorAll('[data-test^="pair-value-"]')).toHaveLength(0);
    expect(rawInput("padding-top").value).toBe("16px");
    expect(rawInput("padding-bottom").value).toBe("0px");
    expect((padding.querySelector('[data-test="individual-sides"]') as HTMLButtonElement).disabled).toBe(true);

    const margin = handle.host.querySelector('[data-test="spacing-margin"]') as HTMLElement;
    expect(margin.getAttribute("data-expanded")).toBe("true");
    expect(rawInput("margin-bottom").value).toBe("12px");
  });

  it("uses the selected element values instead of stale token rows for grouping", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "padding-top": "8px",
      "padding-right": "8px",
      "padding-bottom": "8px",
      "padding-left": "8px",
      "margin-top": "0px",
      "margin-right": "0px",
      "margin-bottom": "0px",
      "margin-left": "0px",
    });
    const staleRows: ResolvedProperty[] = [
      {
        property: "padding-top",
        tokenName: null,
        declaredValue: "16px",
        resolvedValue: "16px",
        computed: "16px",
        confidence: "unknown",
        evidence: { reason: "stale selected element fixture" },
      },
      {
        property: "padding-bottom",
        tokenName: null,
        declaredValue: "0px",
        resolvedValue: "0px",
        computed: "0px",
        confidence: "unknown",
        evidence: { reason: "stale selected element fixture" },
      },
    ];
    handle = mount(createElement(SpacingBox, { element: selected, tokenRows: staleRows }));

    const padding = handle.host.querySelector('[data-test="spacing-padding"]') as HTMLElement;
    expect(padding.getAttribute("data-expanded")).toBe("false");
    expect(padding.querySelectorAll('[data-test^="pair-value-"]')).toHaveLength(2);
  });

  it("keeps equal computed sides grouped when authored token intent differs", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "padding-top": "16px",
      "padding-right": "16px",
      "padding-bottom": "16px",
      "padding-left": "16px",
      "margin-top": "0px",
      "margin-right": "0px",
      "margin-bottom": "0px",
      "margin-left": "0px",
    });
    const tokenRow = (property: string, authored: string, tokenName: string | null): ResolvedProperty => ({
      property,
      tokenName,
      declaredValue: authored,
      authored,
      resolvedValue: "16px",
      confidence: tokenName ? "probable" : "unknown",
      evidence: { reason: "authored intent fixture" },
    });
    handle = mount(createElement(SpacingBox, {
      element: selected,
      tokenRows: [
        tokenRow("padding-top", "16px", null),
        tokenRow("padding-right", "16px", null),
        tokenRow("padding-bottom", "16px", null),
        tokenRow("padding-left", "var(--space-4)", "--space-4"),
      ],
    }));

    const padding = handle.host.querySelector('[data-test="spacing-padding"]') as HTMLElement;
    expect(padding.getAttribute("data-expanded")).toBe("false");
    expect(padding.querySelectorAll('[data-test^="pair-value-"]')).toHaveLength(2);
  });

  it("keeps functional spacing expressions authored in the grouped raw field", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "padding-top": "12px",
      "padding-right": "12px",
      "padding-bottom": "12px",
      "padding-left": "12px",
      "margin-top": "0px",
      "margin-right": "0px",
      "margin-bottom": "0px",
      "margin-left": "0px",
    });
    const rawRow = (property: string): ResolvedProperty => ({
      property,
      tokenName: null,
      declaredValue: "clamp(8px, 2vw, 24px)",
      authored: "clamp(8px, 2vw, 24px)",
      resolvedValue: "12px",
      capability: "raw",
      confidence: "unknown",
      evidence: { reason: "functional spacing fixture" },
    });
    handle = mount(createElement(SpacingBox, {
      element: selected,
      tokenRows: ["padding-top", "padding-right", "padding-bottom", "padding-left"].map(rawRow),
    }));

    expect(rawInput("padding-horizontal").value).toBe("clamp(8px, 2vw, 24px)");
  });
});
