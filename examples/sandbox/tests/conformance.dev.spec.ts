import { expect, test } from "@playwright/test";

test("dev: standard CSS conformance fixture keeps authored attribution separate from browser output", async ({ page }) => {
  await page.goto("/conformance");
  const card = page.locator(".conformance-card");
  await expect(card).toBeVisible();
  const facts = await card.evaluate((element) => ({
    authoredPadding: [...document.styleSheets].flatMap((sheet) => {
      try { return [...sheet.cssRules]; } catch { return []; }
    }).map((rule) => rule.cssText).find((text) => text.includes(".conformance-card")) ?? "",
    computedPadding: getComputedStyle(element).paddingTop,
    computedColor: getComputedStyle(element).color,
    catalog: (window as unknown as { __designTokenCatalog?: { cssName: string; declarations: unknown[] }[] }).__designTokenCatalog ?? [],
  }));
  expect(facts.authoredPadding).toContain("var(--conformance-alias)");
  expect(facts.computedPadding).toBe("16px");
  expect(facts.computedColor).toBe("rgb(51, 65, 85)");
  expect(facts.catalog.some((entry) => entry.cssName === "--conformance-alias")).toBe(true);

  await card.click();
  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    return root?.querySelector('[data-test="selection"]')?.textContent ?? "";
  })).toContain("ConformanceCard");
});
