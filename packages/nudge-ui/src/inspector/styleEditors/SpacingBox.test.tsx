// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { SpacingBox } from "./SpacingBox.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import type { ResolvedProperty } from "../../css/model/index.ts";
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

  function rawInput(prop: string): HTMLInputElement {
    const tokenField = handle.host.querySelector(
      `[data-test="token-field"][data-property="${prop}"]`,
    );
    return tokenField!.querySelector('[data-test="raw-input"]') as HTMLInputElement;
  }

  function showIndividualSides(property: "padding" | "margin"): void {
    const field = handle.host.querySelector(`[data-test="spacing-${property}"]`) as HTMLElement;
    if (field.getAttribute("data-empty") === "true") {
      act(() => {
        (field.querySelector('[data-test="add-value"]') as HTMLButtonElement).click();
      });
    }
    act(() => {
      (handle.host.querySelector(`[data-test="spacing-${property}"] [data-test="individual-sides"]`) as HTMLButtonElement).click();
    });
  }

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

  it("shows an add state for zero margin values", () => {
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
    const margin = handle.host.querySelector('[data-test="spacing-margin"][data-empty="true"]') as HTMLElement;
    expect(margin).toBeTruthy();
    expect(margin.querySelector('[data-test="add-value"]')).toBeTruthy();
    act(() => {
      (margin.querySelector('[data-test="add-value"]') as HTMLButtonElement).click();
    });
    expect(margin.getAttribute("data-expanded")).toBe("false");
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
    expect(handle.host.querySelector('[data-test="spacing-margin"][data-expanded="false"]')).toBeTruthy();
    expect(rawInput("margin-horizontal").value).toBe("16px");
    expect(rawInput("margin-vertical").value).toBe("8px, 24px");

    showIndividualSides("margin");
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

  it("blocks grouped spacing fields when padding is authored inline", () => {
    const { selected } = makeSelected();
    selected.domElement.style.setProperty("padding", "8px");
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
    handle = mount(createElement(SpacingBox, { element: selected }));

    const grouped = handle.host.querySelector('[data-test="token-field"][data-property="padding-horizontal"]') as HTMLElement;
    expect(grouped.querySelector('[data-test="raw-input"]')).toHaveProperty("disabled", true);
    expect(grouped.querySelector('[data-test="inline-style-warning"]')).not.toBeNull();
  });

  it("shows asymmetric pairs as comma-separated values", () => {
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
    expect(padding.getAttribute("data-expanded")).toBe("false");
    expect(rawInput("padding-horizontal").value).toBe("16px");
    expect(rawInput("padding-vertical").value).toBe("8px, 24px");
    expect((padding.querySelector('[data-test="individual-sides"]') as HTMLButtonElement).disabled).toBe(false);

    showIndividualSides("padding");
    expect(rawInput("padding-top").value).toBe("8px");
    expect(rawInput("padding-bottom").value).toBe("24px");
  });

  it("maps mixed axis values back to their physical sides", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "padding-top": "0px",
      "padding-right": "0px",
      "padding-bottom": "0px",
      "padding-left": "0px",
      "margin-top": "16px",
      "margin-right": "12px",
      "margin-bottom": "16px",
      "margin-left": "16px",
    });
    handle = mount(createElement(SpacingBox, { element: selected }));

    expect(rawInput("margin-horizontal").value).toBe("12px, 16px");
    expect(rawInput("margin-vertical").value).toBe("16px");

    showIndividualSides("margin");
    expect(["left", "top", "right", "bottom"].map((side) => rawInput(`margin-${side}`).value))
      .toEqual(["16px", "16px", "12px", "16px"]);

    act(() => {
      (handle.host.querySelector('[data-test="spacing-margin"] [data-test="individual-sides"]') as HTMLButtonElement).click();
    });
    setInputValue(rawInput("margin-horizontal"), "20, 24");
    expect(sheetText()).toContain("margin-right: 20px;");
    expect(sheetText()).toContain("margin-left: 24px;");
  });

  it("collapses a single physical spacing side into its axis pair", () => {
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
    expect(padding.getAttribute("data-expanded")).toBe("false");
    expect(padding.querySelectorAll('[data-test^="pair-value-"]')).toHaveLength(2);
    expect(rawInput("padding-horizontal").value).toBe("0px");
    expect(rawInput("padding-vertical").value).toBe("16px, 0px");

    showIndividualSides("padding");
    expect(rawInput("padding-top").value).toBe("16px");
    expect(rawInput("padding-bottom").value).toBe("0px");

    const margin = handle.host.querySelector('[data-test="spacing-margin"]') as HTMLElement;
    expect(margin.getAttribute("data-expanded")).toBe("false");
    expect(rawInput("margin-vertical").value).toBe("0px, 12px");

    showIndividualSides("margin");
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

  it("resolves calc spacing consistently in grouped and individual fields", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "padding-top": "12px",
      "padding-right": "10px",
      "padding-bottom": "16px",
      "padding-left": "10px",
      "margin-top": "0px",
      "margin-right": "0px",
      "margin-bottom": "0px",
      "margin-left": "0px",
    });
    const calcRow = (property: string, resolvedValue: string): ResolvedProperty => ({
      property,
      tokenName: "--space-4",
      declaredValue: "calc(var(--space-4) * 2)",
      authored: "calc(var(--space-4) * 2)",
      resolvedValue,
      computed: resolvedValue,
      capability: "raw",
      confidence: "probable",
      evidence: { reason: "numeric calc spacing fixture" },
    });
    handle = mount(createElement(SpacingBox, {
      element: selected,
      tokenRows: [
        calcRow("padding-top", "12px"),
        calcRow("padding-right", "10px"),
        calcRow("padding-bottom", "16px"),
        calcRow("padding-left", "10px"),
      ],
    }));

    expect(rawInput("padding-horizontal").value).toBe("10px");
    showIndividualSides("padding");
    expect(rawInput("padding-right").value).toBe("10px");
    expect(rawInput("padding-left").value).toBe("10px");
  });

  it("shows authored auto in a grouped horizontal margin field", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "padding-top": "0px",
      "padding-right": "0px",
      "padding-bottom": "0px",
      "padding-left": "0px",
      "margin-top": "0px",
      "margin-right": "120px",
      "margin-bottom": "0px",
      "margin-left": "120px",
    });
    const autoMarginRow = (property: string): ResolvedProperty => ({
      property,
      tokenName: null,
      declaredValue: "auto",
      authored: "auto",
      resolvedValue: "120px",
      computed: "120px",
      capability: "box-sides",
      confidence: "unknown",
      evidence: { reason: "browser resolved an authored auto margin to its used size" },
    });
    handle = mount(createElement(SpacingBox, {
      element: selected,
      tokenRows: [autoMarginRow("margin-left"), autoMarginRow("margin-right")],
    }));

    expect(rawInput("margin-horizontal").value).toBe("auto");
  });
});
