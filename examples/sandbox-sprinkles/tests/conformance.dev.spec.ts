import { expect, test } from "@playwright/test";

test("Sprinkles conformance uses real generated classes and contract paths", async ({ page }) => {
  await page.goto("/sprinkles");
  const brand = page.locator('[data-test="sprinkles-card"]');
  await expect(brand).toBeVisible();
  const facts = await page.evaluate(() => ({
    className: document.querySelector('[data-test="sprinkles-card"]')?.className ?? "",
    catalog: (window as unknown as { __designTokenCatalog?: Array<{ name: string; adapter?: string; cssName?: string }> }).__designTokenCatalog ?? [],
  }));
  expect(facts.className).not.toMatch(/sprinkles-brand|spr-text-brand/);
  expect(facts.catalog.find((entry) => entry.name === "theme.color.brand" && entry.adapter === "vanilla-extract"))
    .toMatchObject({ adapter: "vanilla-extract", cssName: expect.stringMatching(/^--[A-Za-z0-9_-]+$/) });
});
