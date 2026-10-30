import { clickFrameAction, waitForCanvasTransition } from "./canvasTransition.ts";
import { test, expect } from "@playwright/test";

test("dev: clicking a same-origin link navigates the focused card", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  const board = page.locator('[data-test="canvas-board"]');
  await expect(board.locator(".canvas-card")).toHaveCount(1);

  // Select mode passes clicks to the app; Design mode edits the clicked element.
  await page.locator('[data-test="canvas-tool-select"]').click();

  const frame = page.frameLocator(".canvas-card__iframe").first();
  const conformanceLink = frame.locator('a[href="/conformance"]').first();
  await expect(conformanceLink).toBeVisible({ timeout: 20000 });
  await conformanceLink.click();

  await expect(board.locator(".canvas-card")).toHaveCount(1);

  await expect.poll(() => frame.locator("body").evaluate(() => location.pathname)).toBe("/conformance");
});

test("dev: observed SPA navigation preserves the live application document", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  const frame = page.frameLocator(".canvas-card__iframe").first();
  await frame.locator("body").evaluate(() => {
    (window as Window & { __nudgeProbe?: string }).__nudgeProbe = "retained";
    history.pushState({}, "", "/playground?state=probe");
  });

  await expect.poll(() => frame.locator("body").evaluate(() => location.search)).toBe("?state=probe");
  await expect.poll(() => frame.locator("body").evaluate(() =>
    (window as Window & { __nudgeProbe?: string }).__nudgeProbe,
  )).toBe("retained");
  await expect.poll(() => new URL(page.url()).searchParams.get("state")).toBe("probe");
});

test("dev: same-document hash links do not create new cards", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  const board = page.locator('[data-test="canvas-board"]');
  await expect(board.locator(".canvas-card")).toHaveCount(1);

  const frame = page.frameLocator(".canvas-card__iframe").first();
  const hashLink = frame.locator('a[href="#features"]').first();
  await hashLink.click();
  await expect(board.locator(".canvas-card")).toHaveCount(1);
});

test("dev: duplicate button creates a distinct card with independent iframe", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  const board = page.locator('[data-test="canvas-board"]');
  await expect(board.locator(".canvas-card")).toHaveCount(1);

  await page.locator('[data-test="canvas-show-canvas"]').click();
  const duplicateBtn = page.locator('[data-test^="canvas-card-duplicate-"]').first();
  await expect(duplicateBtn).toBeAttached();
  await clickFrameAction(page, duplicateBtn);

  await expect(board.locator(".canvas-card")).toHaveCount(2);

  const cards = board.locator(".canvas-card");
  const ids = await cards.evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-card-id")),
  );
  expect(ids[0]).not.toBeNull();
  expect(ids[1]).not.toBeNull();
  expect(ids[0]).not.toBe(ids[1]);
});

test("dev: delete key removes a comparison card and recovers the final editing surface", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await page.locator('[data-test="canvas-show-canvas"]').click();

  await page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
  });

  const duplicateBtn = page.locator('[data-test^="canvas-card-duplicate-"]').first();
  await clickFrameAction(page, duplicateBtn);

  const board = page.locator('[data-test="canvas-board"]');
  await expect(board.locator(".canvas-card")).toHaveCount(2);

  await page.keyboard.press("Delete");

  await expect(board.locator(".canvas-card")).toHaveCount(1);
  await page.keyboard.press("Delete");

  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await expect(board.locator(".canvas-card")).toHaveCount(1);
});

test("dev: deleting the active route does not recreate it after reload", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  await page.locator('[data-test="canvas-tool-select"]').click();
  await clickFrameAction(page, page.locator('[data-test^="canvas-card-duplicate-"]').first());
  const cards = page.locator(".canvas-card");
  const frames = page.frameLocator(".canvas-card__iframe");
  await expect(cards).toHaveCount(2);
  await waitForCanvasTransition(page);

  await frames.nth(1).locator('a[href="/conformance"]').click();
  await expect.poll(() => frames.nth(1).locator("body").evaluate(() => location.pathname)).toBe("/conformance");
  await cards.nth(1).locator('[data-test^="canvas-card-drag-"]').click();
  await expect(cards.nth(1)).toHaveClass(/is-selected/);
  await expect.poll(() => new URL(page.url()).pathname).toBe("/conformance");

  await page.locator('[data-test="canvas-tool-design"]').click();
  await cards.nth(1).focus();
  await page.keyboard.press("Delete");

  await expect(cards).toHaveCount(1);
  await expect.poll(() => new URL(page.url()).pathname).toBe("/playground");
  await page.reload();
  await expect(page.locator(".canvas-card")).toHaveCount(1);
  await expect.poll(() => page.frameLocator(".canvas-card__iframe").locator("body").evaluate(() => location.pathname))
    .toBe("/playground");
});

test("dev: Use app normally navigates links inside the frame without adding cards", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  await page.locator('[data-test="canvas-tool-select"]').click();

  const cards = page.locator(".canvas-card");
  await expect(cards).toHaveCount(1);
  const frame = page.frameLocator(".canvas-card__iframe").first();
  const link = frame.locator('a[href="/conformance"]').first();
  await expect(link).toBeVisible({ timeout: 20000 });
  await link.click();

  await expect(cards).toHaveCount(1);
  await expect.poll(() => frame.locator("body").evaluate(() => location.pathname)).toBe("/conformance");
});

test("dev: hovering a link offers opening it in a new canvas frame", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  await page.locator('[data-test="canvas-tool-select"]').click();

  const cards = page.locator(".canvas-card");
  const frame = page.frameLocator(".canvas-card__iframe").first();
  const link = frame.locator('a[href="/conformance"]').first();
  await expect(link).toBeVisible({ timeout: 20000 });

  await link.hover();
  const popover = page.locator('[data-test="canvas-link-popover"]');
  await expect(popover).toBeVisible();
  await expect(popover).toHaveText("Open in new frame");

  const linkBox = await link.boundingBox();
  const popoverBox = await popover.boundingBox();
  expect(linkBox).not.toBeNull();
  expect(popoverBox).not.toBeNull();
  // The action sits centered on its link, just above it unless the frame top is close.
  const centerOffset = Math.abs((popoverBox!.x + popoverBox!.width / 2) - (linkBox!.x + linkBox!.width / 2));
  const gapAbove = linkBox!.y - (popoverBox!.y + popoverBox!.height);
  const gapBelow = popoverBox!.y - (linkBox!.y + linkBox!.height);
  expect(centerOffset).toBeLessThan(1);
  expect(Math.min(Math.abs(gapAbove), Math.abs(gapBelow))).toBeLessThan(1);

  await page.mouse.move(20, 20);
  await expect(popover).toHaveCount(0);

  await link.hover();
  await expect(popover).toBeVisible();
  await popover.click();

  await expect(cards).toHaveCount(2);
  const opened = page.frameLocator(".canvas-card__iframe").nth(1);
  await expect.poll(() => opened.locator("body").evaluate(() => location.pathname)).toBe("/conformance");
});
