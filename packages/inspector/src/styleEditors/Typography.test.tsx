// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { Typography } from "./Typography.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import {
  makeSelected,
  mount,
  setInputValue,
  setSelectValue,
  mockComputedStyle,
  restoreComputedStyle,
  sheetText,
  type MountHandle,
} from "./_testUtils.ts";

describe("Typography", () => {
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

  it("parses font-size value and unit from getComputedStyle on mount", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "font-size": "16px",
      "font-weight": "400",
      "line-height": "1.5",
      "letter-spacing": "0px",
    });
    handle = mount(createElement(Typography, { element: selected }));
    const size = handle.host.querySelector('[data-test="font-size"]') as HTMLInputElement;
    const unit = handle.host.querySelector('[data-test="font-size-unit"]') as HTMLSelectElement;
    expect(size.value).toBe("16");
    expect(unit.value).toBe("px");
  });

  it("writes font-size with the selected unit on number change", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "font-size": "16px",
      "font-weight": "400",
      "line-height": "1.5",
      "letter-spacing": "0px",
    });
    handle = mount(createElement(Typography, { element: selected }));
    const size = handle.host.querySelector('[data-test="font-size"]') as HTMLInputElement;
    setInputValue(size, "18");
    expect(sheetText()).toContain("font-size: 18px;");
  });

  it("round-trips the unit select (rem) into the written rule", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "font-size": "16px",
      "font-weight": "400",
      "line-height": "1.5",
      "letter-spacing": "0px",
    });
    handle = mount(createElement(Typography, { element: selected }));
    const unit = handle.host.querySelector('[data-test="font-size-unit"]') as HTMLSelectElement;
    setSelectValue(unit, "rem");
    expect(sheetText()).toContain("font-size: 16rem;");
  });

  it("writes font-weight via the weight select", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "font-size": "16px",
      "font-weight": "400",
      "line-height": "1.5",
      "letter-spacing": "0px",
    });
    handle = mount(createElement(Typography, { element: selected }));
    const weight = handle.host.querySelector('[data-test="font-weight"]') as HTMLSelectElement;
    setSelectValue(weight, "700");
    expect(sheetText()).toContain("font-weight: 700;");
  });

  it("writes letter-spacing with unit", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "font-size": "16px",
      "font-weight": "400",
      "line-height": "1.5",
      "letter-spacing": "0.05em",
    });
    handle = mount(createElement(Typography, { element: selected }));
    const ls = handle.host.querySelector('[data-test="letter-spacing"]') as HTMLInputElement;
    const lsUnit = handle.host.querySelector('[data-test="letter-spacing-unit"]') as HTMLSelectElement;
    expect(ls.value).toBe("0.05");
    expect(lsUnit.value).toBe("em");
    setInputValue(ls, "1");
    expect(sheetText()).toContain("letter-spacing: 1em;");
  });

  it("writes line-height raw text", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "font-size": "16px",
      "font-weight": "400",
      "line-height": "1.5",
      "letter-spacing": "0px",
    });
    handle = mount(createElement(Typography, { element: selected }));
    const lh = handle.host.querySelector('[data-test="line-height"]') as HTMLInputElement;
    setInputValue(lh, "1.6");
    expect(sheetText()).toContain("line-height: 1.6;");
  });
});
