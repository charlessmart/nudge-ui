import { expect, test } from "@playwright/test";

test("dev: Tailwind's nested @supports color override wins over its fallback", async ({ page }) => {
  await page.goto("/tailwind");
  const fixture = page.locator('[data-test="tailwind-alpha"]');
  await fixture.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });

  const field = page.locator('[data-test="token-field"][data-property="background-color"]');
  await expect(field.locator('[data-test="token-chip"]')).toHaveText("--color-red-500", { timeout: 5000 });
  const indicator = field.locator('[data-test="at-rule-indicator"]');
  await expect(indicator).toContainText("Supports");
  await indicator.hover();
  await expect(page.locator('[data-test="at-rule-tooltip"]')).toContainText("@supports");
  await expect(page.locator('[data-test="at-rule-tooltip"]')).toContainText("color-mix(in lab, red, red)");
});
