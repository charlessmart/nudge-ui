import { test, expect } from "@playwright/test";
import { openEditor } from "@nudge-ui/compatibility/playwright";

test("comment editor flips away from the inspector panel instead of sliding under it", async ({ page }) => {
  // Narrow enough that the heading's right edge leaves no room for the editor beside it before the panel.
  await page.setViewportSize({ width: 760, height: 800 });
  const app = await openEditor(page, "/playground?nudge-ui=on");
  await page.locator('[data-test="canvas-tool-comment"]').click();
  await app.locator("#hero-title").click();
  const editor = page.locator('[data-test="comment-editor"]');
  await expect(editor).toBeVisible();
  const panel = await page.locator(".panel").boundingBox();
  await expect.poll(async () => {
    const box = await editor.boundingBox();
    return box !== null && box.x > 0 && box.x + box.width <= panel!.x + 0.5;
  }).toBe(true);
});
