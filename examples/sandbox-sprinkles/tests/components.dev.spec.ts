import { expect, test } from "@playwright/test";

test("the Sprinkles component fixture exposes token-backed UI components", async ({ page }) => {
  await page.goto("/components");

  await expect(page.getByRole("heading", { name: /Sprinkles/ })).toBeVisible();
  await expect(page.locator('[data-test^="examples-components-spr-"]')).toHaveCount(6);
  await expect(page.locator(".sprinkles-ui-button")).toHaveCount(2);
});
