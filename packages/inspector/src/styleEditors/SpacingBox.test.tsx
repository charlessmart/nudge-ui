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
    expect(padding.querySelector('[data-test="pair-value-horizontal"]')?.className).toContain("dt-control-surface");
    expect(padding.querySelector('[data-test="token-field"][data-property="padding-horizontal"]')?.className).not.toContain("dt-control-surface");
    expect(rawInput("padding-horizontal").value).toBe("12px");
    expect(rawInput("padding-vertical").value).toBe("8px");

    const paddingHorizontalIcon = padding.querySelector('[data-test="pair-value-horizontal"] svg') as SVGSVGElement;
    expect(paddingHorizontalIcon.getAttribute("viewBox")).toBe("0 0 24 24");
    expect(paddingHorizontalIcon.querySelector("rect")?.getAttribute("width")).toBe("18");
    expect([...paddingHorizontalIcon.querySelectorAll("rect, line")].every((shape) => shape.getAttribute("stroke") === "currentColor")).toBe(true);

    const paddingVerticalIcon = padding.querySelector('[data-test="pair-value-vertical"] svg') as SVGSVGElement;
    expect(paddingVerticalIcon.querySelector("rect")?.getAttribute("transform")).toBe("rotate(90 21 3)");

    const margin = handle.host.querySelector('[data-test="spacing-margin"]') as HTMLElement;
    expect(margin.getAttribute("data-empty")).toBe("true");
    act(() => {
      (margin.querySelector('[data-test="add-value"]') as HTMLButtonElement).click();
    });
    const marginHorizontalIcon = margin.querySelector('[data-test="pair-value-horizontal"] svg') as SVGSVGElement;
    expect(marginHorizontalIcon.querySelector("rect")?.getAttribute("x")).toBe("6");
    expect(marginHorizontalIcon.querySelector("rect")?.getAttribute("height")).toBe("14");
    expect(marginHorizontalIcon.querySelectorAll("line")[0]?.getAttribute("x1")).toBe("2");
    expect(marginHorizontalIcon.querySelectorAll("line")[1]?.getAttribute("x1")).toBe("22");

    const marginVerticalIcon = margin.querySelector('[data-test="pair-value-vertical"] svg') as SVGSVGElement;
    expect(marginVerticalIcon.querySelector("rect")?.getAttribute("transform")).toBe("rotate(90 19 6)");
    expect(marginVerticalIcon.querySelector("line")?.getAttribute("x1")).toBe("19");
    expect(marginVerticalIcon.querySelector("line")?.getAttribute("y1")).toBe("2");
    expect(marginVerticalIcon.classList.contains("dt-side-values__axis-icon")).toBe(true);

    showIndividualSides("padding");
    const paddingSides = padding.querySelectorAll('[data-test^="side-value-"]');
    expect(paddingSides).toHaveLength(4);
    const individualIcons = new Map(
      [...paddingSides].map((side) => [
        side.getAttribute("data-side"),
        side.querySelector("svg") as SVGSVGElement,
      ]),
    );
    expect(individualIcons.get("left")?.querySelector("line")?.getAttribute("x1")).toBe("6.75");
    expect(individualIcons.get("right")?.querySelector("line")?.getAttribute("x1")).toBe("17");
    expect(individualIcons.get("bottom")?.querySelector("rect")?.getAttribute("transform")).toBe("rotate(90 21 3)");
    expect(individualIcons.get("top")?.querySelector("rect")?.getAttribute("transform")).toBe("rotate(-90 3 21)");
    expect([...individualIcons.values()].every((icon) => icon.classList.contains("dt-side-values__side-icon"))).toBe(true);

    showIndividualSides("margin");
    const marginSides = margin.querySelectorAll('[data-test^="side-value-"]');
    expect(marginSides).toHaveLength(4);
    const marginIndividualIcons = new Map(
      [...marginSides].map((side) => [
        side.getAttribute("data-side"),
        side.querySelector("svg") as SVGSVGElement,
      ]),
    );
    expect(marginIndividualIcons.get("left")?.querySelector("rect")?.getAttribute("x")).toBe("7");
    expect(marginIndividualIcons.get("left")?.querySelector("line")?.getAttribute("x1")).toBe("3");
    expect(marginIndividualIcons.get("right")?.querySelector("rect")?.getAttribute("x")).toBe("3");
    expect(marginIndividualIcons.get("right")?.querySelector("line")?.getAttribute("x1")).toBe("21");
    expect(marginIndividualIcons.get("top")?.querySelector("rect")?.getAttribute("transform")).toBe("rotate(90 19 7)");
    expect(marginIndividualIcons.get("top")?.querySelector("line")?.getAttribute("x1")).toBe("19");
    expect(marginIndividualIcons.get("bottom")?.querySelector("rect")?.getAttribute("transform")).toBe("rotate(90 19 3)");
    expect(marginIndividualIcons.get("bottom")?.querySelector("line")?.getAttribute("x1")).toBe("19");
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
