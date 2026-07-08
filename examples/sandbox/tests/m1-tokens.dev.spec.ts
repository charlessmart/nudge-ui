import { test, expect } from "@playwright/test";

test("dev: virtual:design-tokens module renders populated token table", async ({ page }) => {
  await page.goto("/");

  const tokensSection = page.locator('[data-test="tokens"]');
  await expect(tokensSection).toBeVisible();

  // styles.css declares 4 color + 3 space custom properties.
  const items = tokensSection.locator("li");
  await expect(items).toHaveCount(7);

  await expect(tokensSection).toContainText("--color-surface-raised");
  await expect(tokensSection).toContainText("--space-1");

  // Console-visible per acceptance criterion.
  const designTokens = await page.evaluate(
    () => (window as unknown as { __designTokens?: unknown }).__designTokens,
  );
  expect(Array.isArray(designTokens)).toBe(true);
  expect((designTokens as unknown[]).length).toBeGreaterThanOrEqual(7);
});