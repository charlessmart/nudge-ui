import { expect, test } from "@playwright/test";

test("the raw CSS component fixture exposes local UI components", async ({ page }) => {
  await page.goto("/components");

  await expect(page.getByRole("heading", { name: /Raw CSS/ })).toBeVisible();
  await expect(page.locator('[data-test^="examples-components-raw-"]')).toHaveCount(7);
  await expect(page.locator(".semantic-button")).toHaveCount(2);
});
