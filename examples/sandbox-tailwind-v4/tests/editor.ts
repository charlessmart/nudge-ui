import { expect, type FrameLocator, type Page } from "@playwright/test";

/** Opens an application route and returns its iframe-first editing surface. */
export async function openEditor(page: Page, path: string): Promise<FrameLocator> {
  await page.goto(path);
  await expect(page).toHaveURL(/[?&]nudge-ui=editor(?:&|#|$)/);
  const app = page.frameLocator('[data-test^="canvas-card-iframe-"]').first();
  await expect(app.locator("body")).toBeVisible();
  return app;
}
