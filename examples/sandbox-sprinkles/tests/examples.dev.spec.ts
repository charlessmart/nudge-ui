import { expect, test } from "@playwright/test";
import { openEditor } from "./editor.ts";

test("Sprinkles uses named color-mix variants for color opacity", async ({ page }) => {
  const app = await openEditor(page, "/examples");

  const facts = await app.locator("html").evaluate(() => {
    const ruleTextFor = (classes: string[]): string => {
      const rules: string[] = [];
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (rule instanceof CSSStyleRule && classes.some((className) => rule.selectorText.includes(`.${className}`))) {
              rules.push(rule.cssText);
            }
          }
        } catch {
          // Cross-origin stylesheets are not inspectable; the app's own sheets are.
        }
      }
      return rules.join("\n");
    };

    const read = (testId: string) => {
      const element = document.querySelector(`[data-test="${testId}"] .color-specimen`);
      if (!(element instanceof HTMLElement)) throw new Error(`Missing ${testId}`);
      return {
        rules: ruleTextFor(Array.from(element.classList)),
        computed: {
          background: getComputedStyle(element).backgroundColor,
          color: getComputedStyle(element).color,
          border: getComputedStyle(element).borderTopColor,
        },
      };
    };

    return {
      background: read("examples-color-spr-03"),
      text: read("examples-color-spr-04"),
      multi: read("examples-color-spr-05"),
    };
  });

  expect(facts.background.rules).toContain("color-mix(in srgb");
  expect(facts.background.rules).toContain("10%");
  expect(facts.text.rules).toContain("color-mix(in srgb");
  expect(facts.text.rules).toContain("80%");
  expect(facts.multi.rules).toContain("30%");
  expect(facts.multi.rules).toContain("75%");
  expect(facts.multi.rules).toContain("40%");
  expect(facts.background.computed.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(facts.text.computed.color).not.toBe("rgba(0, 0, 0, 0)");
  expect(facts.multi.computed.border).not.toBe("rgba(0, 0, 0, 0)");
});
