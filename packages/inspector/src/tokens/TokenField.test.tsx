// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act } from "react";
import { createElement } from "react";
import { TokenField } from "./TokenField.tsx";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "./resolution.ts";
import { resetPendingRules, getChangeRecords } from "./editActions.ts";
import {
  makeSelected,
  mount,
  mockComputedStyle,
  restoreComputedStyle,
  sheetText,
  type MountHandle,
} from "../styleEditors/_testUtils.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const FONT_SIZE: TokenEntry = {
  name: "--font-size-base",
  value: "16px",
  source: "styles.css:1",
};

function tokenRow(): ResolvedProperty {
  return {
    property: "font-size",
    tokenName: FONT_SIZE.name,
    declaredValue: `var(${FONT_SIZE.name})`,
    resolvedValue: FONT_SIZE.value,
    confidence: "exact",
    evidence: { reason: "test fixture" },
  };
}

describe("TokenField", () => {
  let handle: MountHandle;

  beforeEach(() => {
    resetPendingRules();
    document.body.innerHTML = "";
    document.getElementById("design-tool-styles")?.remove();
    mockComputedStyle({ "font-size": "16px" });
  });

  afterEach(() => {
    handle?.unmount();
    restoreComputedStyle();
    resetPendingRules();
    document.body.innerHTML = "";
    document.getElementById("design-tool-styles")?.remove();
  });

  it("waits until blur before applying a raw value and records one committed edit", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property: "font-size",
      domElement: selected.domElement,
      entries: [FONT_SIZE],
    }));
    const input = handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;

    act(() => {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, "18px");
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(sheetText()).toBe("");
    expect(getChangeRecords()).toHaveLength(0);

    act(() => input.blur());

    expect(sheetText()).toContain("font-size: 18px;");
    expect(getChangeRecords()).toHaveLength(1);
  });

  it.each([
    ["padding-top", "8", "8px"],
    ["font-size", "1", "1rem"],
    ["line-height", "120", "120%"],
    ["line-height", "1.6", "160%"],
    ["letter-spacing", "0.04", "0.04em"],
    ["font-weight", "500", "500"],
  ])("completes a bare number for %s", (property, rawValue, expected) => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property,
      domElement: selected.domElement,
      entries: [],
    }));
    const input = handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;

    act(() => {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      setter.call(input, rawValue);
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.blur();
    });

    expect(sheetText()).toContain(`${property}: ${expected};`);
  });

  it("renders a token-backed value as an inline chip", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property: "font-size",
      tokenRow: tokenRow(),
      domElement: selected.domElement,
      entries: [FONT_SIZE],
    }));

    const chip = handle.host.querySelector('[data-test="token-chip"]') as HTMLButtonElement;
    expect(chip).not.toBeNull();
    expect(chip.textContent).toContain("--font-size-base");
    expect(handle.host.querySelector('[data-test="token-select"]')).toBeNull();
  });

  it("returns to a raw input when a token chip is unlinked", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property: "font-size",
      tokenRow: tokenRow(),
      domElement: selected.domElement,
      entries: [FONT_SIZE],
    }));

    act(() => {
      (handle.host.querySelector('[data-test="delink-btn"]') as HTMLButtonElement).click();
    });

    expect(handle.host.querySelector('[data-test="raw-input"]')).not.toBeNull();
    expect(handle.host.querySelector('[data-test="token-chip"]')).toBeNull();
  });

  it("promotes a matching raw-value suggestion into a token chip", () => {
    const { selected } = makeSelected();
    handle = mount(createElement(TokenField, {
      property: "font-size",
      domElement: selected.domElement,
      entries: [FONT_SIZE],
    }));

    const input = handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;
    act(() => input.focus());
    const suggestion = document.querySelector('[data-test="suggestion-item"]') as HTMLElement;

    act(() => suggestion.click());

    expect(sheetText()).toContain("font-size: var(--font-size-base);");
    expect(handle.host.querySelector('[data-test="token-chip"]')?.textContent).toContain("--font-size-base");
  });
});
