// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { createElement } from "react";
import { AtRuleContextProvider, AtRuleIndicator } from "./AtRuleContext.tsx";
import { TokenField } from "../tokens/TokenField.tsx";
import { makeSelected, mockComputedStyle, mount, restoreComputedStyle, type MountHandle } from "../styleEditors/_testUtils.ts";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("AtRuleIndicator", () => {
  let handle: MountHandle | undefined;

  afterEach(() => {
    handle?.unmount();
    restoreComputedStyle();
    document.body.innerHTML = "";
  });

  it("marks a property field whose winning declaration is in a media query", () => {
    const { selected } = makeSelected();
    mockComputedStyle({ "font-size": "17px" });
    handle = mount(
      createElement(
        AtRuleContextProvider,
        {
          rows: [{
            property: "font-size",
            tokenName: null,
            declaredValue: "17px",
            resolvedValue: "17px",
            atRules: [{ kind: "media", params: "(min-width: 1px)" }],
            confidence: "unknown",
            evidence: { reason: "test fixture" },
          }],
        },
        createElement(TokenField, {
          property: "font-size",
          domElement: selected.domElement,
          entries: [],
        }),
      ),
    );

    const indicator = handle.host.querySelector('[data-test="at-rule-indicator"]');
    expect(indicator?.textContent).toContain("Media");
    expect(indicator?.getAttribute("aria-label")).toBe("Active media query");

  });

  it("does not render when no responsive context applies", () => {
    handle = mount(createElement(AtRuleIndicator, { atRules: [] }));
    expect(handle.host.querySelector('[data-test="at-rule-indicator"]')).toBeNull();
  });
});
