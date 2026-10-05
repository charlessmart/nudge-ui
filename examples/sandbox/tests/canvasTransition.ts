import { expect, type Locator, type Page } from "@playwright/test";

export async function waitForCanvasTransition(page: Page): Promise<void> {
  await expect(page.locator('[data-test="canvas-workspace"]')).not.toHaveClass(/is-presentation-transitioning/);
  await page.locator('[data-test="canvas-board-content"]').evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .map((animation) => animation.finished.catch(() => undefined)));
  });
}

export async function clickFrameAction(page: Page, action: Locator): Promise<void> {
  await waitForCanvasTransition(page);
  const cardId = await action.evaluate((element) => element.closest(".canvas-card")?.getAttribute("data-card-id"));
  if (!cardId) throw new Error("Frame action has no owning frame");
  await page.locator(`[data-card-id="${cardId}"]`).hover();
  await action.click();
}
