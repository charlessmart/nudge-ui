// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { invalidateStyleResolutionCache } from "../tokens/resolution/cssomCollector.ts";
import { branchForState } from "../tokens/resolution/ruleMatching.ts";
import { statesOverridingProperty } from "../tokens/resolution.ts";
import { selectorForManagedChange } from "../changes/managedStyleProjection.ts";
import { deserializeChange, isSerializableChange, serializeChange } from "../changes/codecs.ts";
import type { ElementChangeRecord } from "../changes/types.ts";
import { selectorExcludingStates } from "./styleState.ts";

function render(css: string, markup = '<button class="b primary" data-cid="Button" data-src="src/Button.tsx:3:5">Go</button>'): HTMLElement {
  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);
  document.body.innerHTML = markup;
  return document.querySelector<HTMLElement>("button")!;
}

function baseEdit(fields: Partial<ElementChangeRecord> = {}): ElementChangeRecord {
  return {
    kind: "element",
    cid: "Button",
    file: "src/Button.tsx",
    line: 3,
    selector: '[data-cid="Button"][data-src="src/Button.tsx:3:5"]',
    property: "background-color",
    oldToken: null,
    newToken: null,
    rawValue: "red",
    source: { file: "src/Button.tsx", line: 3, component: "Button" },
    scope: "source-site",
    state: "base",
    ...fields,
  };
}

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  invalidateStyleResolutionCache(document);
});

describe("branchForState", () => {
  it("reads a negated state as a guard that holds outside that state", () => {
    expect(branchForState(".b:not(:hover)", "base")).toBe(".b:not([data-nudge-ui-never])");
    expect(branchForState(".b:not(:hover)", "hover")).toBeNull();
    expect(branchForState(".b:not(:hover)", "active")).toBe(".b:not([data-nudge-ui-never])");
  });

  it("keeps a state rule's own guard matchable in that state", () => {
    expect(branchForState(".b:hover:not(:disabled)", "hover")).toBe(".b:not([data-nudge-ui-never])");
    expect(branchForState(".b:hover:not(:disabled)", "disabled")).toBeNull();
    expect(branchForState(".b:hover", "base")).toBeNull();
  });
});

describe("statesOverridingProperty", () => {
  it("names the states whose own rule wins the property", () => {
    const el = render([
      ".b { background-color: gray; color: black; }",
      ".b:hover { background-color: blue; }",
      ".b:active { transform: translateY(1px); }",
      ".b:disabled { background: silver; }",
    ].join("\n"));
    expect(statesOverridingProperty(el, "background-color")).toEqual(["hover", "disabled"]);
    expect(statesOverridingProperty(el, "color")).toEqual([]);
  });

  it("ignores a state rule that loses the cascade to the base rule", () => {
    const el = render([
      "body .b.primary { background-color: gray; }",
      ".b:hover { background-color: blue; }",
    ].join("\n"));
    expect(statesOverridingProperty(el, "background-color")).toEqual([]);
  });
});

describe("selectorForManagedChange", () => {
  it("keeps a base edit off the states that set the property, including forced sheet states", () => {
    expect(selectorForManagedChange(baseEdit({ preservedStates: ["hover", "focus"] }))).toBe(
      '[data-cid="Button"][data-src="src/Button.tsx:3:5"]'
        + ':not(:hover, [data-nudge-ui-sheet-state="hover"] *)'
        + ':not(:focus, [data-nudge-ui-sheet-state="focus-visible"] *)',
    );
    expect(selectorForManagedChange(baseEdit())).toBe('[data-cid="Button"][data-src="src/Button.tsx:3:5"]');
  });

  it("stops painting the hovered element once guarded", () => {
    const el = render(".b { background-color: gray; }");
    const guarded = selectorExcludingStates('[data-cid="Button"]', ["disabled"]);
    expect(el.matches(guarded)).toBe(true);
    el.setAttribute("disabled", "");
    expect(el.matches(guarded)).toBe(false);
  });

  it("persists preserved states with the change", () => {
    const serialized = serializeChange(baseEdit({ preservedStates: ["hover"] }));
    expect(isSerializableChange(serialized)).toBe(true);
    expect(deserializeChange(serialized!)).toMatchObject({ preservedStates: ["hover"] });
    expect(isSerializableChange({ ...serialized, preservedStates: ["base"] })).toBe(false);
  });
});
