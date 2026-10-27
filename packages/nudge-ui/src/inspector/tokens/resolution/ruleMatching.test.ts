// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { collectRules, invalidateStyleResolutionCache } from "./cssomCollector.ts";
import { createRuleMatcher, matchRuleForElement } from "./ruleMatching.ts";

afterEach(() => {
  document.head.innerHTML = "";
  document.body.innerHTML = "";
  invalidateStyleResolutionCache(document);
});

describe("rule matching", () => {
  it("matches the same rules as testing every rule against the element", () => {
    const style = document.createElement("style");
    style.textContent = [
      ".card { color: red; }",
      ".card.featured { color: blue; }",
      ".other, .card > .title { color: green; }",
      "div { margin: 0; }",
      "* { box-sizing: border-box; }",
      ".sm\\:p-4 { padding: 1rem; }",
      ":is(.card, .other) .title { font-weight: 600; }",
      ".missing { color: black; }",
      ".card:not(.featured) { opacity: 1; }",
      ".title:first-child { color: purple; }",
      "#hero .title { color: teal; }",
      ".title + .body { margin-top: 4px; }",
      "section { display: block; }",
      "H2 { margin: 0; }",
      "section#hero { padding: 0; }",
      "#hero { position: relative; }",
      "p, span { line-height: 1.4; }",
      "p.body, h2:hover { color: navy; }",
      "[data-x] { color: gray; }",
      "div[data-x]:first-child, h2 { color: olive; }",
      ":root { color: black; }",
      "#missing { color: red; }",
      "article { color: red; }",
    ].join("\n");
    document.head.append(style);
    document.body.innerHTML = `
      <section id="hero">
        <div class="card featured sm:p-4">
          <h2 class="title">Title</h2>
          <p class="body">Body</p>
        </div>
        <div class="other" data-x></div>
        <span></span>
      </section>`;
    const { rules } = collectRules(document);

    for (const element of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
      for (const transform of ["live", "stable", "base"] as const) {
        const expected = rules
          .filter((rule) => matchRuleForElement(element, { rule, selectorText: rule.selectorText }))
          .map((rule) => rule.sourceOrder);
        const actual = createRuleMatcher(rules, transform).matchesForElement(element).allMatched
          .map((match) => match.rule.sourceOrder)
          .sort((left, right) => left! - right!);
        expect(actual, `${transform} ${element.outerHTML.slice(0, 40)}`).toEqual(expected);
      }
    }
  });
});
