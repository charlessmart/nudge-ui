// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { collectRules, invalidateStyleResolutionCache } from "./cssomCollector.ts";

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
});
