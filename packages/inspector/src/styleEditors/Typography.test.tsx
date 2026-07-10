// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { Typography } from "./Typography.tsx";
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

  it("renders a TokenField for font-size in raw mode by default", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "font-size": "16px",
      "font-weight": "400",
      "line-height": "1.5",
      "letter-spacing": "0px",
    });
    handle = mount(createElement(Typography, { element: selected }));
    const tokenField = handle.host.querySelector('[data-test="token-field"][data-property="font-size"]');
    expect(tokenField).toBeTruthy();
    const raw = tokenField!.querySelector('[data-test="raw-input"]') as HTMLInputElement;
    expect(raw).toBeTruthy();
    expect(raw.value).toBe("16px");
  });

  it("writes font-size via the raw input", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "font-size": "16px",
      "font-weight": "400",
      "line-height": "1.5",
      "letter-spacing": "0px",
    });
    handle = mount(createElement(Typography, { element: selected }));
    const tokenField = handle.host.querySelector('[data-test="token-field"][data-property="font-size"]');
    const raw = tokenField!.querySelector('[data-test="raw-input"]') as HTMLInputElement;
    setInputValue(raw, "18px");
    expect(sheetText()).toContain("font-size: 18px;");
  });

  it("writes font-weight via the raw input", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "font-size": "16px",
      "font-weight": "400",
      "line-height": "1.5",
      "letter-spacing": "0px",
    });
    handle = mount(createElement(Typography, { element: selected }));
    const tokenField = handle.host.querySelector('[data-test="token-field"][data-property="font-weight"]');
    const raw = tokenField!.querySelector('[data-test="raw-input"]') as HTMLInputElement;
    setInputValue(raw, "700");
    expect(sheetText()).toContain("font-weight: 700;");
  });

  it("writes line-height via the raw input", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "font-size": "16px",
      "font-weight": "400",
      "line-height": "1.5",
      "letter-spacing": "0px",
    });
    handle = mount(createElement(Typography, { element: selected }));
    const tokenField = handle.host.querySelector('[data-test="token-field"][data-property="line-height"]');
    const raw = tokenField!.querySelector('[data-test="raw-input"]') as HTMLInputElement;
    setInputValue(raw, "1.6");
    expect(sheetText()).toContain("line-height: 1.6;");
  });

  it("writes letter-spacing via the raw input", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "font-size": "16px",
      "font-weight": "400",
      "line-height": "1.5",
      "letter-spacing": "0.05em",
    });
    handle = mount(createElement(Typography, { element: selected }));
    const tokenField = handle.host.querySelector('[data-test="token-field"][data-property="letter-spacing"]');
    const raw = tokenField!.querySelector('[data-test="raw-input"]') as HTMLInputElement;
    expect(raw.value).toBe("0.05em");
    setInputValue(raw, "1em");
    expect(sheetText()).toContain("letter-spacing: 1em;");
  });

  it("renders a TokenField for each typographic property", () => {
    const { selected } = makeSelected();
    mockComputedStyle({
      "font-size": "16px",
      "font-weight": "400",
      "line-height": "1.5",
      "letter-spacing": "0px",
    });
    handle = mount(createElement(Typography, { element: selected }));
    for (const prop of ["font-size", "font-weight", "line-height", "letter-spacing", "font-family"]) {
      expect(handle.host.querySelector(`[data-test="token-field"][data-property="${prop}"]`)).toBeTruthy();
    }
  });
});
