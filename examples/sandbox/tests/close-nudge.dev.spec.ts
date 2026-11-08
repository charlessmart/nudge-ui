import { expect, test } from "@playwright/test";
import { openEditor } from "@nudge-ui/compatibility/playwright";

// Closing leaves the plain app with one floating button; reloads stay closed, and the button reopens the editor.
test("Close Nudge leaves the plain page and the floating button reopens the editor", async ({ page }) => {
  await openEditor(page, "/app?nudge-ui=editor");

  await page.locator('[data-test="settings-button"]').click();
  await page.locator('[data-test="settings-close-nudge"]').click();

  await expect(page).toHaveURL(/__nudge_ui_direct=1/);
  await expect(page.locator('[data-test="canvas-workspace"]')).toHaveCount(0);
  await expect(page.locator('[data-test="open-nudge"]')).toBeVisible();

  await page.reload();
  await expect(page.locator('[data-test="open-nudge"]')).toBeVisible();
  await expect(page.locator('[data-test="canvas-workspace"]')).toHaveCount(0);

  await page.locator('[data-test="open-nudge"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible({ timeout: 30_000 });
});
