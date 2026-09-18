import { expect, type Frame, type FrameLocator, type Locator, type Page } from "@playwright/test";

/** Opens an application route and returns its iframe-first editing surface. */
export async function openEditor(page: Page, path: string): Promise<FrameLocator> {
  await page.goto(path);
  await expect(page).toHaveURL(/[?&]nudge-ui=editor(?:&|#|$)/);
  const app = page.frameLocator('[data-test^="canvas-card-iframe-"]').first();
  await expect(app.locator("body")).toBeVisible();
  return app;
}

/** Returns the ready application frame for helpers that need page-realm evaluation. */
export async function getAppFrame(page: Page): Promise<Frame> {
  await expect.poll(() => page.frames().find((frame) => frame !== page.mainFrame()
    && frame.url().startsWith("http")
    && !frame.url().includes("/__nudge_ui__/editor"))?.url() ?? "").not.toBe("");
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame()
    && candidate.url().startsWith("http")
    && !candidate.url().includes("/__nudge_ui__/editor"));
  if (!frame) throw new Error("Nudge UI preview frame did not become ready");
  return frame;
}

/** Locates application content in the active iframe while inspector locators remain on the page. */
export function appLocator(page: Page, selector: string): Locator {
  return page.frameLocator('[data-test^="canvas-card-iframe-"]').first().locator(selector);
}

/** Takes over a restored editor session when a previous browser page still owns it. */
export async function ensureEditorOwnership(page: Page): Promise<void> {
  const workspace = page.locator('[data-test="canvas-workspace"]');
  const takeover = page.getByRole("button", { name: "Take Over Here" });
  await expect.poll(async () => (await workspace.count()) + (await takeover.count())).toBeGreaterThan(0);
  if (await takeover.isVisible()) await takeover.click();
  await expect(workspace).toBeVisible();
}
