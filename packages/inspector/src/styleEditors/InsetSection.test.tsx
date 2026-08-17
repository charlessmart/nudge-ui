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

  it("shows grouped inset values after the section is added", () => {
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

    expect(handle.host.querySelector('[data-test="pair-value-horizontal"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="pair-value-vertical"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="inset-horizontal"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="top"]')).toBeNull();
    const topIcon = handle.host.querySelector('[data-side="top"] svg') as SVGSVGElement;
    expect(topIcon).toBeNull();

    act(() => {
      (handle.host.querySelector('[data-test="individual-sides"]') as HTMLButtonElement).click();
    });

    expect(handle.host.querySelector('[data-test="token-field"][data-property="top"]')).toBeTruthy();
    const expandedTopIcon = handle.host.querySelector('[data-side="top"] svg') as SVGSVGElement;
    expect(expandedTopIcon.classList.contains("dt-side-values__side-icon")).toBe(true);
    expect(expandedTopIcon.querySelector("rect")?.getAttribute("x")).toBe("19");
  });

  it("opens individual inset values when the physical sides differ", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      position: "relative",
      top: "12px",
      right: "8px",
      bottom: "4px",
      left: "16px",
    });
    handle = mount(createElement(InsetSection, { element: selected }));

    expect(handle.host.querySelector('[data-test="layout-inset"][data-expanded="true"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="token-field"][data-property="top"]')).toBeTruthy();
    expect(handle.host.querySelector('[data-test="pair-value-horizontal"]')).toBeNull();
    expect(sheetText()).not.toContain("top: auto;");
  });
});
