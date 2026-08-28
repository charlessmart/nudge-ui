// @vitest-environment jsdom
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { AspectRatioField } from "./AspectRatioField.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import { makeSelected, mount, mockComputedStyle, restoreComputedStyle, setInputValue, sheetText, type MountHandle } from "./_testUtils.ts";

describe("AspectRatioField", () => {
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
  });

  it("preserves authored ratio syntax and variables", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "aspect-ratio": "4 / 3" });
    handle = mount(createElement(AspectRatioField, { domElement: el }));

    const input = handle.host.querySelector('[data-test="layout-aspect-ratio-input"]') as HTMLInputElement;
    expect(input.value).toBe("4 / 3");
    setInputValue(input, "var(--media-ratio)");

    expect(sheetText()).toContain("aspect-ratio: var(--media-ratio);");
  });

  it("does not treat ratio values as pixel lengths", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "aspect-ratio": "auto" });
    handle = mount(createElement(AspectRatioField, { domElement: el }));

    setInputValue(handle.host.querySelector('[data-test="layout-aspect-ratio-input"]') as HTMLInputElement, "3 / 2");
    expect(sheetText()).not.toContain("3 / 2px");
    expect(sheetText()).toContain("aspect-ratio: 3 / 2;");
  });
});
