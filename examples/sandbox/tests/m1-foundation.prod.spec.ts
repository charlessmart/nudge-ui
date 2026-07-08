import { test, expect } from "@playwright/test";

test("prod: data-cid / data-src / data-cprops absent from production build", async ({ page }) => {
  await page.goto("http://localhost:4173/");

  const button = page.locator("button").first();
  await expect(button).toBeVisible();
  await expect(button).not.toHaveAttribute("data-cid", /.*/);
  await expect(button).not.toHaveAttribute("data-src", /.*/);
  await expect(button).not.toHaveAttribute("data-cprops", /.*/);

  const appDiv = page.locator('[data-cid="App"]');
  await expect(appDiv).toHaveCount(0);
});