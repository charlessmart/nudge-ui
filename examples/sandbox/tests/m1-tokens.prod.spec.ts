import { test, expect } from "@playwright/test";

test("prod: token table is emptied in the production build (ADR-0002)", async ({ page }) => {
  await page.goto("http://localhost:4173/");

  // No token list rendered (section is dev-gated).
  await expect(page.locator('[data-test="tokens"]')).toHaveCount(0);

  // No token name leaks into the rendered DOM.
  const body = page.locator("body");
  await expect(body).not.toContainText("color-surface-raised");
  await expect(body).not.toContainText("space-1");

  // Runtime gate: __designTokens must not be set in production.
  const leaked = await page.evaluate(
    () => (window as unknown as { __designTokens?: unknown }).__designTokens,
  );
  expect(leaked).toBeUndefined();
});