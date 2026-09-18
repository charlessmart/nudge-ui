import { test, expect } from "@playwright/test";

test("dev: clicking a same-origin link navigates the focused card", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  const board = page.locator('[data-test="canvas-board"]');
  await expect(board.locator(".canvas-card")).toHaveCount(1);

  // Click the conformance link inside the iframe
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

  // Click a hash link inside the iframe
  const frame = page.frameLocator(".canvas-card__iframe").first();
  const hashLink = frame.locator('a[href="#features"]').first();
  await hashLink.click();
  // Should still have only 1 card (hash links don't create cards)
  await expect(board.locator(".canvas-card")).toHaveCount(1);
});

test("dev: duplicate button creates a distinct card with independent iframe", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  const board = page.locator('[data-test="canvas-board"]');
  await expect(board.locator(".canvas-card")).toHaveCount(1);

  await page.locator('[data-test="presentation-canvas"]').click();
  // Click the duplicate button on the first card
  const duplicateBtn = page.locator('[data-test^="canvas-card-duplicate-"]').first();
  await expect(duplicateBtn).toBeVisible();
  await duplicateBtn.click();

  // Two cards now
  await expect(board.locator(".canvas-card")).toHaveCount(2);

  // Both cards should have distinct IDs
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
  await page.locator('[data-test="presentation-canvas"]').click();

  // Add a second card first
  await page.evaluate(() => {
    const win = window as unknown as Record<string, unknown>;
    // We'll use the duplicate mechanism instead
  });

  // Create a duplicate card to have 2 cards
  const duplicateBtn = page.locator('[data-test^="canvas-card-duplicate-"]').first();
  await duplicateBtn.click();

  const board = page.locator('[data-test="canvas-board"]');
  await expect(board.locator(".canvas-card")).toHaveCount(2);

  // Delete the selected card.
  await page.keyboard.press("Delete");

  // One card remains
  await expect(board.locator(".canvas-card")).toHaveCount(1);

  // Select the remaining card, then delete it. The primary route recovers.
  await board.locator('[data-test^="canvas-card-reload-"]').click();
  await page.keyboard.press("Delete");

  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await expect(board.locator(".canvas-card")).toHaveCount(1);
});

test("dev: deleting the active route does not recreate it after reload", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="presentation-canvas"]').click();
  await page.locator('[data-test^="canvas-card-duplicate-"]').first().click();
  const cards = page.locator(".canvas-card");
  const frames = page.frameLocator(".canvas-card__iframe");
  await expect(cards).toHaveCount(2);

  await frames.nth(1).locator('a[href="/conformance"]').click();
  await expect.poll(() => frames.nth(1).locator("body").evaluate(() => location.pathname)).toBe("/conformance");
  await cards.nth(1).locator('[data-test^="canvas-card-drag-"]').click();
  await expect(cards.nth(1)).toHaveClass(/is-selected/);
  await expect.poll(() => new URL(page.url()).pathname).toBe("/conformance");

  await page.locator('[data-test="presentation-focus"]').focus();
  await page.keyboard.press("Delete");

  await expect(cards).toHaveCount(1);
  await expect.poll(() => new URL(page.url()).pathname).toBe("/playground");
  await page.reload();
  await expect(page.locator(".canvas-card")).toHaveCount(1);
  await expect.poll(() => page.frameLocator(".canvas-card__iframe").locator("body").evaluate(() => location.pathname))
    .toBe("/playground");
});

test("dev: open app escapes the editor to the plain application route", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await page.locator('[data-test="presentation-canvas"]').click();

  // Open the focused route as a plain application page.
  const popupPromise = page.waitForEvent("popup");
  await page.locator('[data-test^="canvas-card-open-app-"]').first().click();
  const application = await popupPromise;
  await expect(application.locator("#root")).toBeVisible();
  await expect(application.locator('[data-test="canvas-workspace"]')).toHaveCount(0);
  await application.locator('a[href="/conformance"]').click();
  await expect(application).toHaveURL(/\/conformance$/);
  await expect(application.locator("#root")).toBeVisible();
  await expect(application.locator("#nudge-ui-root")).toHaveJSProperty("shadowRoot", null);
  await application.reload();
  await expect(application).toHaveURL(/\/conformance$/);
  await expect(application.locator("#nudge-ui-root")).toHaveJSProperty("shadowRoot", null);
});



test("dev: canvas card toolbar has open-app, duplicate, and refresh controls", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await page.locator('[data-test="presentation-canvas"]').click();
  await expect(page.locator('[data-test="mode-canvas"]')).toHaveCount(0);

  await expect(page.locator('[data-test^="canvas-card-duplicate-"]')).toBeVisible();
  const openApp = page.locator('[data-test^="canvas-card-open-app-"]');
  await expect(openApp).toHaveText("Open app");
  await expect(openApp).toHaveClass(/button--secondary/);
  await expect(openApp).toHaveClass(/button--default/);
  await expect(page.locator('[data-test^="canvas-card-reload-"]')).toBeVisible();
  await expect(page.locator('[data-test^="canvas-card-duplicate-"]')).toHaveClass(/icon-button--secondary/);
  await expect(page.locator('[data-test^="canvas-card-reload-"]')).toHaveClass(/icon-button--secondary/);
  await expect(page.locator('[data-test^="canvas-card-remove-"]')).toHaveCount(0);

  const card = page.locator(".canvas-card").first();
  const toolbar = card.locator(".canvas-card__toolbar");
  const frame = card.locator(".canvas-card__frame");
  const toolbarBox = await toolbar.boundingBox();
  const frameBox = await frame.boundingBox();
  expect(toolbarBox).not.toBeNull();
  expect(frameBox).not.toBeNull();
  expect(toolbarBox!.y + toolbarBox!.height).toBeLessThan(frameBox!.y);
});
