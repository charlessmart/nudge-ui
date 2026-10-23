import { test, expect } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
});

test("dev: the DOM navigator steps aside while Explode view holds a subtree apart", async ({ page }) => {
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await expect(frame.locator("body")).toBeVisible({ timeout: 20000 });

  // A selection gives the navigator a chip to draw beside the element.
  await frame.locator("#hero-title").click();
  const navigator = page.locator('[data-test="dom-navigator"]');
  await expect(navigator).toBeVisible();

  // The view tool starts on Outline view, so pick Explode view from its menu.
  await page.locator('[data-test="canvas-tool-debug"]').click();
  await page.locator('[data-test="canvas-tool-debug-menu"]').click();
  await page.locator('[data-test="debug-view-explode"]').click();
  // The page is still whole, so the chip has nothing to get in the way of yet.
  await expect(navigator).toBeVisible();

  // Clicking pulls the subtree apart, and the chip steps aside rather than sitting on the layers.
  await frame.locator("#hero-title").click();
  await expect(navigator).toHaveCount(0);

  // Putting the tool away puts the page back together and the chip with it.
  await page.locator('[data-test="canvas-tool-debug"]').click();
  await expect(navigator).toBeVisible();
});
