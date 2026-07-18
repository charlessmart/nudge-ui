import { expect, test } from "@playwright/test";

test("dev: Sprinkles fixture exposes contract path, managed swap, and prompt vocabulary", async ({ page }) => {
  await page.goto("/sprinkles");
  const brand = page.locator('[data-test="sprinkles-card"]');
  await brand.click();
  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    return root?.querySelector('[data-test="token-field"][data-property="color"] [data-test="token-chip"]')?.textContent?.trim() ?? null;
  })).toBe("theme.color.brand");
  const catalog = await page.evaluate(() => (window as unknown as { __designTokenCatalog?: { name: string; cssName: string; adapter?: string }[] }).__designTokenCatalog ?? []);
  expect(catalog.find((entry) => entry.name === "theme.color.brand")).toMatchObject({ cssName: "--color-brand__hash", adapter: "vanilla-extract" });
  expect(await page.locator('[data-test="token-field"][data-property="color"]').count()).toBeGreaterThan(0);

  await page.locator('[data-test="token-field"][data-property="color"] [data-test="token-chip"]').click();
  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    return Array.from(root?.querySelectorAll('[data-test="suggestion-item"]') ?? []).map((item) => item.textContent ?? "");
  })).toEqual(expect.arrayContaining([expect.stringContaining("theme.color.accent")]));
});

test("dev: unknown atomic class remains inspectable without invented mapping", async ({ page }) => {
  await page.goto("/sprinkles");
  await page.locator('[data-test="sprinkles-raw"]').click();
  await page.locator('[data-test="spacing-padding"] [data-test="individual-sides"]').click();
  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    return root?.querySelector('[data-test="token-field"][data-property="padding-top"] [data-test="raw-input"]') !== null;
  })).toBe(true);
});
