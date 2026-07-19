import { test, expect } from "@playwright/test";

test("prod: canvas workspace and mode toggle are absent from production build", async ({ page }) => {
  await page.goto("/");

  // No canvas mode toggle
  await expect(page.locator('[data-test="canvas-mode-toggle"]')).not.toBeAttached();

  // No canvas host
  await expect(page.locator("#design-tool-canvas-host")).not.toBeAttached();

  // No canvas workspace
  await expect(page.locator('[data-test="canvas-workspace"]')).not.toBeAttached();
});

test("prod: no canvas renderer marker or runtime protocol code", async ({ page }) => {
  await page.goto("/");

  // No iframes with the canvas renderer marker
  const markerIframe = page.locator(
    `[data-design-tool-canvas-renderer]`,
  );
  await expect(markerIframe).not.toBeAttached();

  // No canvas-related data attributes on any element
  const canvasAttrs = await page.evaluate(() => {
    const elements = document.querySelectorAll("*");
    const attrs: string[] = [];
    elements.forEach((el) => {
      Array.from(el.attributes).forEach((attr) => {
        if (attr.name.includes("canvas")) attrs.push(attr.name);
      });
    });
    return attrs;
  });
  expect(canvasAttrs).toEqual([]);
});
