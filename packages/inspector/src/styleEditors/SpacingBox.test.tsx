// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { SpacingBox } from "./SpacingBox.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import type { ResolvedProperty } from "../tokens/resolution.ts";
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

  it("renders a TokenField per padding side with computed values on mount", () => {
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
    expect(handle.host.querySelector('[data-test="token-field"][data-property="padding-top"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="padding-right"]')).toBeTruthy();
    const pt = rawInput("padding-top");
    const pr = rawInput("padding-right");
    expect(pt.value).toBe("8px");
    expect(pr.value).toBe("12px");
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
    expect(sheetText()).toContain('[data-cid="Button"][data-src*="src/Button.tsx:1"]');
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
    expect(rawInput("padding-top").value).toBe("auto");
    expect(rawInput("padding-right").value).toBe("1rem");
    expect(rawInput("padding-left").value).toBe("8px");
  });

  it("renders margin TokenFields", () => {
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
    expect(handle.host.querySelector('[data-test="spacing-margin"][data-linked="true"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="margin"]')).toBeTruthy();
    showIndividualSides("margin");
    expect(handle.host.querySelector('[data-test="token-field"][data-property="margin-top"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="margin-right"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="margin-bottom"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="margin-left"]')).toBeTruthy();
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

    expect(rawInput("margin-top").value).toBe("8px");
    expect(rawInput("margin-right").value).toBe("16px");
    expect(rawInput("margin-bottom").value).toBe("24px");
    expect(rawInput("margin-left").value).toBe("16px");
  });

  it("writes a linked shorthand when all four sides share one value", () => {
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
    expect(handle.host.querySelector('[data-test="spacing-padding"][data-linked="true"]')).toBeTruthy();
    setInputValue(rawInput("padding"), "24px");
    expect(sheetText()).toContain("padding: 24px;");
  });

  it("links divergent padding sides to the top side value", () => {
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
    expect(padding.getAttribute("data-linked")).toBe("false");
    act(() => (padding.querySelector('[data-test="individual-sides"]') as HTMLButtonElement).click());

    expect(padding.getAttribute("data-linked")).toBe("true");
    expect(sheetText()).toContain("padding: 8px;");
  });
});
