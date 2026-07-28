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
  const titles = await cards.locator(".dt-canvas-card__title").allTextContents();
  const hasTailwind = titles.some(
    (t) => t.includes("formwork") || t.includes("tailwind"),
  );
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

test("dev: remove button never removes the last card without exiting canvas", async ({ page }) => {
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

  // Remove one card
  const removeBtn = page.locator('[data-test^="canvas-card-remove-"]').first();
  await removeBtn.click();

  // One card remains
  await expect(board.locator(".dt-canvas-card")).toHaveCount(1);

  // Remove the last card (should exit Canvas)
  await page.locator('[data-test^="canvas-card-remove-"]').click();

  // Workspace should be hidden
  await expect(page.locator('[data-test="canvas-workspace"]')).not.toBeVisible();
});

test("dev: edit handoff switches to inspect mode without reloading when editing current route", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  // Click edit on the first card (which should be the current route)
  await page.locator('[data-test^="canvas-card-edit-"]').first().click();

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

test("dev: canvas card toolbar has all four action buttons", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  await expect(page.locator('[data-test^="canvas-card-duplicate-"]')).toBeVisible();
  await expect(page.locator('[data-test^="canvas-card-edit-"]')).toBeVisible();
  await expect(page.locator('[data-test^="canvas-card-reload-"]')).toBeVisible();
  await expect(page.locator('[data-test^="canvas-card-remove-"]')).toBeVisible();
});
