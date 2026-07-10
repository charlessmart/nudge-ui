// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { SpacingBox } from "./SpacingBox.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
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
    expect(handle.host.querySelector('[data-test="token-field"][data-property="margin-top"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="margin-right"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="margin-bottom"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="margin-left"]')).toBeTruthy();
  });
});
