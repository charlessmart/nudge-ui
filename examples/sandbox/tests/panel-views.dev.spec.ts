import { test, expect } from "@playwright/test";
import { openEditor } from "@nudge-ui/compatibility/playwright";

test("selecting a layer keeps the Pages panel open", async ({ page }) => {
  await openEditor(page, "/playground?nudge-ui=editor");
  await page.locator('[data-test="panel-view-pages"]').click();
  const tree = page.locator('[data-test="layer-tree"]');
  await expect(tree).toBeVisible();

  const layer = tree.locator('[data-test="layer-tree-item"]').first();
  await expect(layer).toBeVisible();
  await layer.click();

  // Selecting never switches the panel, so a layer pick leaves the tree that holds it open.
  await expect(page.locator('[data-test="panel-view-pages"]')).toHaveAttribute("data-active", "true");
  await expect(tree).toBeVisible();
  await expect(tree.locator('[data-test="layer-tree-item"][data-current="true"]')).toHaveCount(1);
});
