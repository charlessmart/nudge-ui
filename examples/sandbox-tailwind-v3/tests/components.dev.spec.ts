import { expect, test } from "@playwright/test";

test("the Tailwind v3 component fixture exposes typed UI examples", async ({ page }) => {
  await page.goto("/components");

  await expect(page.getByRole("heading", { name: /Tailwind v3/ })).toBeVisible();
  await expect(page.locator('[data-test^="examples-components-tw3-"]')).toHaveCount(6);
  await expect(page.getByText("Tailwind v3 utilities")).toBeVisible();
});
