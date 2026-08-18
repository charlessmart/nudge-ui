import { expect, test } from "@playwright/test";

test("the shadcn gallery renders every installed registry component", async ({ page }) => {
  await page.goto("/components");

  await expect(page.getByRole("heading", { name: /Every component/ })).toBeVisible();
  await expect(page.getByText("61 components")).toBeVisible();
  await expect(page.locator('[data-test="shadcn-item"]')).toHaveCount(1);
  await expect(page.locator('[data-test^="shadcn-"]')).toHaveCount(61);
});
