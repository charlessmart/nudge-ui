import { waitForCanvasTransition } from "./canvasTransition.ts";
import { expect, test } from "@playwright/test";

test("page selection scopes the changes count and prompt while linked views share the page", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async (text: string) => { sessionStorage.setItem("copied-prompt", text); },
    } });
  });
  await page.goto("/playground");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  const cards = page.locator(".canvas-card");
  const original = cards.first().locator("iframe").contentFrame();
  await original.locator("#hero-title").dblclick();
  await original.locator('[data-inline-editor="true"]').fill("Playground pending text");
  await original.locator('[data-inline-editor="true"]').press("Enter");
  await expect(page.locator('[data-test="copy-prompt-change-count"]')).toHaveText("1");
  await original.locator("body").evaluate((body) => { body.dataset.transientState = "preserved"; });
  await cards.first().locator('[data-test^="canvas-card-duplicate-"]').click();
  await expect(cards).toHaveCount(2);
  await expect(original.locator("body")).toHaveAttribute("data-transient-state", "preserved");
  await expect(page.locator('[data-test="copy-prompt-change-count"]')).toHaveText("1");
  await page.locator('[data-test="canvas-board-content"]').evaluate(async (element) => {
    await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined)));
  });
  const linked = cards.nth(1).locator("iframe").contentFrame();
  await linked.locator("body").evaluate((body) => {
    const link = body.ownerDocument.createElement("a");
    link.id = "other-page"; link.href = "/examples"; link.textContent = "Examples";
    link.style.cssText = "position:fixed;left:100px;top:100px;width:200px;height:80px;background:white;z-index:9999";
    body.append(link);
  });
  await page.keyboard.down("Shift");
  await linked.locator("#other-page").click();
  await page.keyboard.up("Shift");
  await expect(cards).toHaveCount(3);
  await expect(page.locator('[data-test="copy-prompt-change-count"]')).toHaveCount(0);
  await expect(cards.nth(2).locator('[data-test^="canvas-card-loading-"]')).toHaveCount(0);
  await expect(page.locator('[data-test="canvas-tool-design"]')).toHaveAttribute("aria-pressed", "true");
  await waitForCanvasTransition(page);
  const examples = cards.nth(2).locator("iframe").contentFrame();
  await examples.locator("h1").first().dblclick();
  await examples.locator('[data-inline-editor="true"]').fill("Examples pending text");
  await examples.locator('[data-inline-editor="true"]').press("Enter");
  await expect(page.locator('[data-test="copy-prompt-change-count"]')).toHaveText("1");
  await page.locator('[data-test="copy-prompt"]').click();
  const examplesPrompt = await page.evaluate(() => sessionStorage.getItem("copied-prompt"));
  expect(examplesPrompt).toContain("/examples");
  expect(examplesPrompt).toContain("Examples pending text");
  expect(examplesPrompt).not.toContain("Playground pending text");
  await cards.first().locator('[data-test^="canvas-card-focus-"]').dispatchEvent("click");
  await expect(page.locator('[data-test="copy-prompt-change-count"]')).toHaveText("1");
  await page.locator('[data-test="copy-prompt"]').click();
  const playgroundPrompt = await page.evaluate(() => sessionStorage.getItem("copied-prompt"));
  expect(playgroundPrompt).toContain("/playground");
  expect(playgroundPrompt).toContain("Playground pending text");
  expect(playgroundPrompt).not.toContain("Examples pending text");
  await page.reload();
  await expect(page.locator('[data-test="copy-prompt-change-count"]')).toHaveText("1");
});
