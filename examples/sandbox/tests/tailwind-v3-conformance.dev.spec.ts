import { expect, test } from "@playwright/test";

test("dev: Tailwind v3 fixture exposes config provenance and opacity helper", async ({ page }) => {
  await page.goto("/tailwind-v3");
  const card = page.locator('[data-test="tailwind-v3-card"]');
  await expect(card).toBeVisible();
  const catalog = await page.evaluate(() => (window as unknown as { __designTokenCatalog?: { name: string; adapter?: string; origin?: string }[] }).__designTokenCatalog ?? []);
  expect(catalog.find((entry) => entry.name === "theme.colors.brand")).toMatchObject({ adapter: "tailwind-v3", origin: "project" });
  expect(await card.evaluate((element) => getComputedStyle(element).backgroundColor)).toContain("rgba");
  await card.click();
  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    return root?.querySelector('[data-test="token-attribution"]')?.textContent?.trim() ?? null;
  })).toContain("theme.colors.brand");
});
