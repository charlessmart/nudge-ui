// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { ColorPicker } from "./ColorPicker.tsx";
import { resetPendingRules } from "../tokens/editActions.ts";
import type { TokenEntry } from "virtual:design-tokens";
import type { ResolvedProperty } from "../tokens/resolution.ts";
import {
  makeSelected,
  mount,
  mockComputedStyle,
  restoreComputedStyle,
  sheetText,
  type MountHandle,
} from "./_testUtils.ts";

const ENTRIES: TokenEntry[] = [
  { name: "--color-text-primary", value: "#111111", source: "s:1" },
  { name: "--color-text-secondary", value: "#666666", source: "s:2" },
  { name: "--color-surface-raised", value: "#ffffff", source: "s:3" },
  { name: "--space-1", value: "4px", source: "s:6" },
];

const TOKEN_ROW: ResolvedProperty = {
  property: "color",
  tokenName: "--color-text-primary",
  declaredValue: "var(--color-text-primary)",
  resolvedValue: "#111111",
  confidence: "exact",
  evidence: { reason: "test fixture" },
};

describe("ColorPicker", () => {
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

  it("renders a TokenField", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ color: "rgb(17, 17, 17)" });
    handle = mount(createElement(ColorPicker, { element: selected, entries: ENTRIES }));
    const field = handle.host.querySelector('[data-test="token-field"]');
    expect(field).toBeTruthy();
    expect(field!.getAttribute("data-property")).toBe("color");
  });

  it("shows a token dropdown when tokenRow is provided", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ color: "rgb(17, 17, 17)" });
    handle = mount(createElement(ColorPicker, { element: selected, entries: ENTRIES, tokenRow: TOKEN_ROW }));
    const select = handle.host.querySelector('[data-test="token-select"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    expect(select.value).toBe("--color-text-primary");
  });

  it("shows a raw input when no tokenRow is provided", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ color: "rgb(17, 17, 17)" });
    handle = mount(createElement(ColorPicker, { element: selected, entries: ENTRIES }));
    const raw = handle.host.querySelector('[data-test="raw-input"]') as HTMLInputElement;
    expect(raw).toBeTruthy();
  });
});
