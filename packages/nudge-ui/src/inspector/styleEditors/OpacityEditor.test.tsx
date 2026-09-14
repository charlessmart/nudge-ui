// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { OpacityEditor } from "./OpacityEditor.tsx";
import type { ResolvedProperty } from "../../css/model/index.ts";
import type { TokenEntry } from "../../css/model/index.ts";
import { resetPendingRules } from "../tokens/editActions.ts";
import {
  makeSelected,
  mockComputedStyle,
  mount,
  restoreComputedStyle,
  setInputValue,
  sheetText,
  type MountHandle,
} from "./_testUtils.ts";

describe("OpacityEditor", () => {
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

  it("shows the computed opacity as a percentage and writes a normalized value", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ opacity: "0.6" });
    handle = mount(createElement(OpacityEditor, { element: selected }));

    const input = handle.host.querySelector('[data-test="opacity-input"]') as HTMLInputElement;
    expect(input.value).toBe("60%");

    setInputValue(input, "40%");
    expect(sheetText()).toContain("opacity: 40%;");
  });

  it("keeps a referenced opacity token visible beside its effective percentage", () => {
    const { selected } = makeSelected();
    const token: TokenEntry = { name: "--opacity-muted", value: "0.35", source: "theme.css:1" };
    const row: ResolvedProperty = {
      property: "opacity",
      tokenName: token.name,
      declaredValue: `var(${token.name})`,
      authored: `var(${token.name})`,
      resolvedValue: "0.35",
      propertyOpacity: {
        value: "35%",
        authoredValue: `var(${token.name})`,
        tokenName: token.name,
        token: { name: token.name, origin: "project" },
        editable: true,
      },
      confidence: "exact",
      evidence: { reason: "test fixture" },
    };
    mockComputedStyle({ opacity: "0.35" });
    handle = mount(createElement(OpacityEditor, { element: selected, entries: [token], tokenRows: [row] }));

    const chip = handle.host.querySelector('.token-chip') as HTMLElement;
    expect(chip.classList).toContain("token-chip--small");
    expect(chip.querySelector(".token-chip__label")?.textContent).toBe("0.35");
    expect(chip.querySelector(".token-chip__label")?.getAttribute("title")).toBe(token.name);
    expect(handle.host.querySelector('[data-test="opacity-effective"]')?.textContent).toBe("35%");
  });
});
