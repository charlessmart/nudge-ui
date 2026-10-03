import { waitForCanvasTransition } from "./canvasTransition.ts";
import { test, expect } from "@playwright/test";

test("focus-mode address navigation replaces the current frame", async ({ page }) => {
  await page.goto("/playground");
  const cards = page.locator(".canvas-card");
  await expect(cards).toHaveCount(1);
  const id = await cards.first().getAttribute("data-card-id");
  await expect(cards.first().locator("iframe").contentFrame().locator("h1").first()).toBeVisible();
  await page.goto("/conformance?nudge-ui=editor");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute("data-card-id", id!);
  await expect.poll(() => cards.first().locator("iframe").contentFrame().locator("body").evaluate(() => location.pathname)).toBe("/conformance");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  await expect(cards).toHaveCount(1);
});

test("independent views of the same live route show purple peers without a group bar", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  const cards = page.locator(".canvas-card");
  await cards.first().locator('[data-test^="canvas-card-duplicate-"]').click();
  await cards.nth(1).locator('[data-test^="canvas-card-focus-"]').click();
  await page.goto("/conformance?nudge-ui=editor");
  await expect(cards).toHaveCount(2);
  await expect.poll(() => cards.nth(1).locator("iframe").contentFrame().locator("body").evaluate(() => location.pathname)).toBe("/conformance");
  await page.goto("/playground?nudge-ui=editor");
  await expect(cards).toHaveCount(2);
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  await expect(page.locator('[data-test="canvas-linked-group"]')).toHaveCount(0);
  await expect(cards.first()).toHaveClass(/is-linked-peer/);
  await expect(cards.nth(1)).not.toHaveClass(/is-linked-peer/);
  await expect(cards.first()).toHaveCSS("outline-color", "rgb(168, 85, 247)");
  await cards.first().locator('[data-test^="canvas-card-drag-"]').dispatchEvent("pointerdown", { button: 0, pointerId: 1, clientX: 300, clientY: 200 });
  await page.mouse.up();
  await expect(cards.first()).not.toHaveClass(/is-linked-peer/);
  await expect(cards.nth(1)).toHaveClass(/is-linked-peer/);
});

test("canvas links open a new route once and return to its existing live frame", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  await page.locator('[data-test="canvas-tool-select"]').click();
  const cards = page.locator(".canvas-card");
  const originalId = await cards.first().getAttribute("data-card-id");
  await cards.first().locator("iframe").contentFrame().locator('a[href="/conformance"]').first().click();
  await expect(cards).toHaveCount(2);
  const destination = cards.nth(1).locator("iframe").contentFrame();
  await expect(cards.nth(1).locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible();
  await destination.locator('a[href="/examples/raw-css"]').evaluate((link: HTMLAnchorElement) => {
    link.href = "/playground";
    link.textContent = "Return to existing page";
  });
  await destination.getByRole("link", { name: "Return to existing page" }).click();
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveAttribute("data-card-id", originalId!);
  await expect(cards.first()).toHaveClass(/is-selected/);
});
