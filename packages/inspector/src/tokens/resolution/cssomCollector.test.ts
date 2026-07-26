// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import {
  collectRules,
  declarationsFromCssom,
  invalidateStyleResolutionCache,
} from "./cssomCollector.ts";

describe("CSSOM collector", () => {
  afterEach(() => {
    document.head.innerHTML = "";
    document.body.innerHTML = "";
    invalidateStyleResolutionCache(document);
  });

  it("assigns selector specificity as part of collection", () => {
    const style = document.createElement("style");
    style.textContent = ".subject, #subject { color: red; }";
    document.head.appendChild(style);

    const rule = collectRules(document).rules[0];

    expect(rule).toMatchObject({
      selectorText: ".subject, #subject",
      specificity: 1_000_000,
      declarations: [{ property: "color", value: "red", important: false }],
    });
  });

  it("reads serialized CSSOM shorthands before indexed longhand expansion", () => {
    const style = document.createElement("div").style;
    style.setProperty("--space-4", "clamp(8px, 2vw, 24px)");
    style.setProperty("padding-inline", "var(--space-4)", "important");
    style.setProperty("font", "italic 600 1.25rem/1.5 var(--font-family)");

    expect(declarationsFromCssom(style)).toEqual([
      { property: "--space-4", value: "clamp(8px, 2vw, 24px)", important: false },
      { property: "padding-inline", value: "var(--space-4)", important: true },
      { property: "font", value: "italic 600 1.25rem/1.5 var(--font-family)", important: false },
    ]);
  });

  it("uses a CSSOM mutation as the declaration source", () => {
    const style = document.createElement("style");
    style.textContent = ".subject { color: red; }";
    document.head.appendChild(style);

    const rule = style.sheet?.cssRules[0];
    expect(rule).toBeInstanceOf(CSSStyleRule);
    (rule as CSSStyleRule).style.setProperty("color", "blue");
    invalidateStyleResolutionCache(document);

    expect(collectRules(document).rules[0]?.declarations).toEqual([
      { property: "color", value: "blue", important: false },
    ]);
  });
});
