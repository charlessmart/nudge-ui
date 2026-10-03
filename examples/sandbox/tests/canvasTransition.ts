import { expect, type Page } from "@playwright/test";

export async function waitForCanvasTransition(page: Page): Promise<void> {
  await expect(page.locator('[data-test="canvas-workspace"]')).not.toHaveClass(/is-presentation-transitioning/);
  await page.locator('[data-test="canvas-board-content"]').evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true })
      .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
      .map((animation) => animation.finished.catch(() => undefined)));
  });
}
