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

  it("reads per-side padding/margin from getComputedStyle on mount", () => {
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
    const pt = handle.host.querySelector('[data-test="padding-top"]') as HTMLInputElement;
    const pr = handle.host.querySelector('[data-test="padding-right"]') as HTMLInputElement;
    expect(pt.value).toBe("8");
    expect(pr.value).toBe("12");
  });

  it("composes padding shorthand and writes a managed-sheet rule on per-side change", () => {
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
    const pt = handle.host.querySelector('[data-test="padding-top"]') as HTMLInputElement;
    setInputValue(pt, "24");
    expect(sheetText()).toContain('[data-cid="Button"][data-src*="src/Button.tsx"]');
    expect(sheetText()).toContain("padding: 24px 0px 0px 0px;");
    expect(el.style.padding).toBe("");
  });

  it("composes margin shorthand on per-side margin change", () => {
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
    const mb = handle.host.querySelector('[data-test="margin-bottom"]') as HTMLInputElement;
    setInputValue(mb, "16");
    expect(sheetText()).toContain("margin: 0px 0px 16px 0px;");
  });

  it("treats auto / non-px values as 0 when reading", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "padding-top": "auto",
      "padding-right": "none",
      "padding-bottom": "",
      "padding-left": "8px",
      "margin-top": "0px",
      "margin-right": "0px",
      "margin-bottom": "0px",
      "margin-left": "0px",
    });
    handle = mount(createElement(SpacingBox, { element: selected }));
    const pt = handle.host.querySelector('[data-test="padding-top"]') as HTMLInputElement;
    const pr = handle.host.querySelector('[data-test="padding-right"]') as HTMLInputElement;
    const pl = handle.host.querySelector('[data-test="padding-left"]') as HTMLInputElement;
    expect(pt.value).toBe("0");
    expect(pr.value).toBe("0");
    expect(pl.value).toBe("8");
  });
});
