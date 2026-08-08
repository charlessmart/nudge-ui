import { test, expect } from "@playwright/test";

test("dev: clicking same-origin link inside canvas iframe creates a new card", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  const board = page.locator('[data-test="canvas-board"]');
  await expect(board.locator(".dt-canvas-card")).toHaveCount(1);

  // Click the Tailwind link inside the iframe
  const frame = page.frameLocator(".dt-canvas-card__iframe").first();
  const tailwindLink = frame.locator('a[href="/tailwind"]').first();
  await expect(tailwindLink).toBeVisible({ timeout: 20000 });
  await tailwindLink.click();

  // A second card should appear for /tailwind
  await expect(board.locator(".dt-canvas-card")).toHaveCount(2);

  const cards = board.locator(".dt-canvas-card");
  const frameUrls = await cards.locator(".dt-canvas-card__iframe").evaluateAll((frames) =>
    frames.map((frame) => (frame as HTMLIFrameElement).src),
  );
  const hasTailwind = frameUrls.some((url) => url.includes("/tailwind"));
  expect(hasTailwind).toBe(true);
});

test("dev: same-document hash links do not create new cards", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  const board = page.locator('[data-test="canvas-board"]');
  await expect(board.locator(".dt-canvas-card")).toHaveCount(1);

  // Click a hash link inside the iframe
  const frame = page.frameLocator(".dt-canvas-card__iframe").first();
  const hashLink = frame.locator('a[href="#features"]').first();
  if (await hashLink.isVisible({ timeout: 5000 }).catch(() => false)) {
    await hashLink.click();
    // Should still have only 1 card (hash links don't create cards)
    await expect(board.locator(".dt-canvas-card")).toHaveCount(1);
  }
});

test("dev: duplicate button creates a distinct card with independent iframe", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  const board = page.locator('[data-test="canvas-board"]');
  await expect(board.locator(".dt-canvas-card")).toHaveCount(1);

  // Click the duplicate button on the first card
  const duplicateBtn = page.locator('[data-test^="canvas-card-duplicate-"]').first();
  await expect(duplicateBtn).toBeVisible();
  await duplicateBtn.click();

  // Two cards now
  await expect(board.locator(".dt-canvas-card")).toHaveCount(2);

  // Both cards should have distinct IDs
  const cards = board.locator(".dt-canvas-card");
  const ids = await cards.evaluateAll((els) =>
    els.map((el) => el.getAttribute("data-card-id")),
  );
  expect(ids[0]).not.toBeNull();
  expect(ids[1]).not.toBeNull();
  expect(ids[0]).not.toBe(ids[1]);
});

test("dev: delete key removes the selected card and exits canvas when it is the last card", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  // Add a second card first
  await page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    // We'll use the duplicate mechanism instead
  });

  // Create a duplicate card to have 2 cards
  const duplicateBtn = page.locator('[data-test^="canvas-card-duplicate-"]').first();
  await duplicateBtn.click();

  const board = page.locator('[data-test="canvas-board"]');
  await expect(board.locator(".dt-canvas-card")).toHaveCount(2);

  // Delete the selected card.
  await page.keyboard.press("Delete");

  // One card remains
  await expect(board.locator(".dt-canvas-card")).toHaveCount(1);

  // Select the remaining card, then delete it (should exit Canvas).
  await board.locator('[data-test^="canvas-card-reload-"]').click();
  await page.keyboard.press("Delete");

  // Workspace should be hidden
  await expect(page.locator('[data-test="canvas-workspace"]')).not.toBeVisible();
});

test("dev: edit handoff switches to inspect mode without reloading when editing current route", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  // Click edit on the first card (which should be the current route)
  await page.locator('[data-test^="canvas-card-preview-"]').first().click();

  // Canvas workspace should be gone
  await expect(page.locator('[data-test="canvas-workspace"]')).not.toBeVisible();

  // Mode should be back to inspect
  await expect(page.locator('[data-test="mode-preview"]')).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // The host page content should still be present
  const root = page.locator("#root");
  await expect(root).toBeVisible();
});

test("dev: canvas card toolbar has preview, duplicate, and refresh controls", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  await expect(page.locator('[data-test^="canvas-card-duplicate-"]')).toBeVisible();
  const preview = page.locator('[data-test^="canvas-card-preview-"]');
  await expect(preview).toHaveText("Preview");
  await expect(preview).toHaveClass(/dt-button--secondary/);
  await expect(page.locator('[data-test^="canvas-card-reload-"]')).toBeVisible();
  await expect(page.locator('[data-test^="canvas-card-duplicate-"]')).toHaveClass(/dt-icon-button--secondary/);
  await expect(page.locator('[data-test^="canvas-card-reload-"]')).toHaveClass(/dt-icon-button--secondary/);
  await expect(page.locator('[data-test^="canvas-card-remove-"]')).toHaveCount(0);

  const card = page.locator(".dt-canvas-card").first();
  const toolbar = card.locator(".dt-canvas-card__toolbar");
  const frame = card.locator(".dt-canvas-card__frame");
  const toolbarBox = await toolbar.boundingBox();
  const frameBox = await frame.boundingBox();
  expect(toolbarBox).not.toBeNull();
  expect(frameBox).not.toBeNull();
  expect(toolbarBox!.y + toolbarBox!.height).toBeLessThan(frameBox!.y);
});
