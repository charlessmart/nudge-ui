// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { act, createElement } from "react";
import { InsetSection } from "./InsetSection.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import {
  makeSelected,
  mount,
  mockComputedStyle,
  restoreComputedStyle,
  sheetText,
  type MountHandle,
} from "./_testUtils.ts";

describe("InsetSection", () => {
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

  it("hides empty inset values until the section is added", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      position: "relative",
      top: "auto",
      right: "auto",
      bottom: "auto",
      left: "auto",
    });
    handle = mount(createElement(InsetSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-inset"][data-empty="true"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="top"]')).toBeNull();

    act(() => {
      (handle.host.querySelector('[data-test="add-inset"]') as HTMLButtonElement).click();
    });

    expect(handle.host.querySelector('[data-test="remove-inset"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="top"]')).toBeTruthy();
  });

  it("removes all inset values with the section minus action", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      position: "relative",
      top: "12px",
      right: "8px",
      bottom: "4px",
      left: "16px",
    });
    handle = mount(createElement(InsetSection, { element: selected }));

    act(() => {
      (handle.host.querySelector('[data-test="remove-inset"]') as HTMLButtonElement).click();
    });

    expect(sheetText()).toContain("top: auto;");
    expect(sheetText()).toContain("right: auto;");
    expect(sheetText()).toContain("bottom: auto;");
    expect(sheetText()).toContain("left: auto;");
  });
});
