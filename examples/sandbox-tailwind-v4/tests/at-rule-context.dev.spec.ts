import { expect, test } from "@playwright/test";

test("dev: Tailwind's nested @supports color override wins over its fallback", async ({ page }) => {
  await page.goto("/tailwind");
  const fixture = page.locator('[data-test="tailwind-alpha"]');
  await fixture.click({ position: { x: 5, y: 5 } });

  const field = page.locator('[data-test="token-field"][data-property="background-color"]');
  await expect(field.locator('[data-test="token-chip"]')).toHaveText("--color-red-500", { timeout: 5000 });
  const indicator = field.locator('[data-test="at-rule-indicator"]');
  await expect(indicator).toHaveText("1");
  await indicator.hover();
  await expect(page.locator('[data-test="at-rule-tooltip"] [data-active="true"]'))
    .toHaveText("(color: color-mix(in lab, red, red))");
});
