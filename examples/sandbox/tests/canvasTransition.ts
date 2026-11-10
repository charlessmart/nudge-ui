import { expect, type Locator, type Page } from "@playwright/test";

export async function waitForCanvasTransition(page: Page): Promise<void> {
  await expect(page.locator('[data-test="canvas-workspace"]')).not.toHaveClass(/is-presentation-transitioning/);
  await page.locator('[data-test="canvas-board-content"]').evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .map((animation) => animation.finished.catch(() => undefined)));
  });
}

/** Leaves Focus for the Canvas by unticking View in focus in the toolbar's zoom menu. */
export async function showCanvas(page: Page): Promise<void> {
  await page.locator('[data-test="canvas-zoom-menu"]').click();
  await page.locator('[data-test="canvas-zoom-focus"]').click();
}

export async function clickFrameAction(page: Page, action: Locator): Promise<void> {
  await waitForCanvasTransition(page);
  const cardId = await action.evaluate((element) => element.closest(".canvas-card")?.getAttribute("data-card-id"));
  if (!cardId) throw new Error("Frame action has no owning frame");
  await page.locator(`[data-card-id="${cardId}"]`).hover();
  await action.click();
}

/** Duplicates a frame (the first by default) through its more menu. */
export async function duplicateFrame(page: Page, card: Locator = page.locator(".canvas-card").first()): Promise<void> {
  await waitForCanvasTransition(page);
  await card.hover();
  await card.locator('[data-test^="canvas-card-more-"]').click();
  await page.locator('[data-test^="canvas-card-duplicate-"]').click();
}

/** Waits until a frame's page has loaded, which is when its Unlink or Duplicate actions become available. */
export async function waitForFrameReady(card: Locator): Promise<void> {
  await expect(card.locator("iframe")).toBeAttached();
  await expect(card.locator('[data-test^="canvas-card-loading-"], [data-test^="canvas-card-error-"]')).toHaveCount(0);
}
