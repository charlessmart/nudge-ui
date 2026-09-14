// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, createElement } from "react";
import type { TokenEntry } from "../../css/model/index.ts";
import type { ResolvedProperty } from "../../css/model/index.ts";
import { GapField } from "./GapField.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import {
  makeSelected,
  mount,
  mockComputedStyle,
  restoreComputedStyle,
  sheetText,
  type MountHandle,
} from "./_testUtils.ts";

const SPACE_4: TokenEntry = {
  name: "--space-4",
  value: "16px",
  source: "tokens.css:1",
};

const SPACE_5: TokenEntry = {
  name: "--space-5",
  value: "32px",
  source: "tokens.css:2",
};

function row(overrides: Partial<ResolvedProperty> = {}): ResolvedProperty {
  return {
    property: "column-gap",
    tokenName: null,
    declaredValue: "12px",
    resolvedValue: "12px",
    capability: "atomic",
    confidence: "exact",
    evidence: { reason: "test fixture" },
    ...overrides,
  };
}

describe("GapField", () => {
  let handle: MountHandle;

  beforeEach(() => {
    resetPendingRules();
    document.body.innerHTML = "";
    document.getElementById("nudge-ui-styles")?.remove();
  });

  afterEach(() => {
    handle?.unmount();
    restoreComputedStyle();
    resetPendingRules();
    document.body.innerHTML = "";
    document.getElementById("nudge-ui-styles")?.remove();
  });

  it("renders a token-backed gap as a token chip", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "column-gap": "16px" });
    handle = mount(createElement(GapField, {
      property: "column-gap",
      domElement: el,
      entries: [SPACE_4],
      tokenRows: [row({
        tokenName: SPACE_4.name,
        declaredValue: `var(${SPACE_4.name})`,
        resolvedValue: SPACE_4.value,
      })],
    }));

    const field = handle.host.querySelector('[data-test="layout-combo"][data-property="column-gap"]');
    expect(field).toBeTruthy();
    expect(field?.querySelector('[data-test="token-field"]')).toBeTruthy();
    expect(field?.querySelector('[data-test="token-chip"]')).toBeTruthy();
    expect(field?.querySelector('[data-test="layout-combo-input-column-gap"]')).toBeNull();
  });

  it("keeps raw gap values editable when the value is not a simple token", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "column-gap": "12px" });
    handle = mount(createElement(GapField, {
      property: "column-gap",
      domElement: el,
      entries: [SPACE_4],
      tokenRows: [row({
        declaredValue: "clamp(8px, 2vw, 24px)",
        resolvedValue: "12px",
        capability: "raw",
      })],
    }));

    const input = handle.host.querySelector('[data-test="layout-combo-input-column-gap"]') as HTMLInputElement;
    expect(input).toBeTruthy();
    expect(input.value).toBe("clamp(8px, 2vw, 24px)");
  });

  it("swaps a gap token on the projected longhand", () => {
    const { el } = makeSelected();
    mockComputedStyle({ "column-gap": "16px" });
    handle = mount(createElement(GapField, {
      property: "column-gap",
      domElement: el,
      entries: [SPACE_4, SPACE_5],
      tokenRows: [row({
        tokenName: SPACE_4.name,
        declaredValue: `var(${SPACE_4.name})`,
        resolvedValue: SPACE_4.value,
      })],
    }));

    act(() => (handle.host.querySelector('[data-test="token-chip"]') as HTMLButtonElement).click());
    const option = Array.from(document.body.querySelectorAll<HTMLElement>('[data-test="suggestion-item"]'))
      .find((item) => item.textContent?.includes(SPACE_5.name));
    expect(option).toBeTruthy();

    act(() => option?.click());

    expect(sheetText()).toContain(`column-gap: var(${SPACE_5.name});`);
  });

  it("keeps token-backed gaps blocked when the shorthand is inline", () => {
    const { el } = makeSelected();
    el.style.setProperty("gap", `var(${SPACE_4.name})`);
    mockComputedStyle({ "column-gap": "16px" });
    handle = mount(createElement(GapField, {
      property: "column-gap",
      domElement: el,
      entries: [SPACE_4],
      tokenRows: [row({
        tokenName: SPACE_4.name,
        declaredValue: `var(${SPACE_4.name})`,
        resolvedValue: SPACE_4.value,
      })],
    }));

    const trigger = handle.host.querySelector('[data-test="token-chip"]') as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);
    expect(handle.host.querySelector('[data-test="layout-combo-blocked"]')).toBeTruthy();
  });
});
