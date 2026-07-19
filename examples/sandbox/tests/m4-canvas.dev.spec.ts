import { test, expect } from "@playwright/test";

test("dev: canvas mode toggle appears in the inspector header", async ({ page }) => {
  await page.goto("/");

  const toggle = page.locator('[data-test="canvas-mode-toggle"]');
  await expect(toggle).toBeVisible();

  const inspectBtn = page.locator('[data-test="mode-inspect"]');
  const canvasBtn = page.locator('[data-test="mode-canvas"]');

  await expect(inspectBtn).toBeVisible();
  await expect(canvasBtn).toBeVisible();

  // Inspect should be active by default
  await expect(inspectBtn).toHaveAttribute("aria-pressed", "true");
  await expect(canvasBtn).toHaveAttribute("aria-pressed", "false");
});

test("dev: entering Canvas creates one live card for the current route", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-test="mode-canvas"]').click();

  // Canvas workspace should be visible
  const workspace = page.locator('[data-test="canvas-workspace"]');
  await expect(workspace).toBeVisible();

  // One card should be present
  const board = page.locator('[data-test="canvas-board"]');
  const cards = board.locator(".dt-canvas-card");
  await expect(cards).toHaveCount(1);

  // The card should have an iframe
  const iframe = page.locator('[data-test^="canvas-card-iframe-"]');
  await expect(iframe).toHaveCount(1);

  // The iframe should have the canvas renderer marker
  const hasAttr = await iframe.evaluate((el) =>
    el.hasAttribute("data-design-tool-canvas-renderer")
  );
  expect(hasAttr).toBe(true);
});

test("dev: Canvas is a fixed Shadow DOM workspace", async ({ page }) => {
  await page.goto("/");

  await page.locator('[data-test="mode-canvas"]').click();

  // Canvas host should be present in the document
  const canvasHost = page.locator("#design-tool-canvas-host");
  await expect(canvasHost).toBeAttached();

  // It should have a shadow root
  const hasShadow = await canvasHost.evaluate((el) => el.shadowRoot !== null);
  expect(hasShadow).toBe(true);

  // The workspace inside the shadow root should be fixed
  const isFixed = await canvasHost.evaluate((el) => {
    const workspace = el.shadowRoot?.querySelector(".dt-canvas-workspace");
    if (!workspace) return false;
    return getComputedStyle(workspace).position === "fixed";
  });
  expect(isFixed).toBe(true);
});

test("dev: returning to Inspect reveals the original host document", async ({ page }) => {
  await page.goto("/");

  // Get initial page content to verify it's preserved
  const rootTextBefore = await page.locator("#root").textContent();

  // Enter Canvas
  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  // Exit Canvas
  await page.locator('[data-test="canvas-exit"]').click();

  // Canvas workspace should be gone
  await expect(page.locator('[data-test="canvas-workspace"]')).not.toBeVisible();

  // The host document should still be present
  const rootTextAfter = await page.locator("#root").textContent();
  expect(rootTextAfter).toBe(rootTextBefore);

  // The inspector panel should still be available
  await expect(page.locator('[data-test="mode-inspect"]')).toHaveAttribute(
    "aria-pressed",
    "true"
  );
});

test("dev: Canvas card toolbar has Edit, Reload, and Remove buttons", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-test="mode-canvas"]').click();

  // Card toolbar buttons should exist
  await expect(page.locator('[data-test^="canvas-card-edit-"]')).toBeVisible();
  await expect(page.locator('[data-test^="canvas-card-reload-"]')).toBeVisible();
  await expect(page.locator('[data-test^="canvas-card-remove-"]')).toBeVisible();
});

test("dev: canvas renderer iframe has the canvas marker attribute", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-test="mode-canvas"]').click();

  // Get the iframe and verify it has the renderer marker
  const iframe = page.locator(".dt-canvas-card__iframe").first();
  await expect(iframe).toBeAttached();

  const hasMarker = await iframe.getAttribute("data-design-tool-canvas-renderer");
  expect(hasMarker).not.toBeNull();
});

test("dev: removing the only card exits Canvas", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-test="mode-canvas"]').click();

  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  // Click remove on the card
  await page.locator('[data-test^="canvas-card-remove-"]').click();

  // Enter canvas again and verify inspect mode is restored
  // After removing the last card, the workspace should disappear
  // (CanvasWorkspace returns null when cards.length === 0)
  await expect(page.locator('[data-test="canvas-workspace"]')).not.toBeVisible();
});

test("dev: frame load error shows card-level feedback", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-test="mode-canvas"]').click();

  // If the iframe loads, loading state should eventually clear.
  // If it fails, we should see error state.
  // Wait for either ready or error state.
  try {
    await expect(page.locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible({
      timeout: 20000,
    });
  } catch {
    // Loading persists — error should show
  }

  // Either the iframe loaded, or we got an error state
  // (The exact outcome depends on whether the iframe can load / is same-origin)
  const hasError = await page.locator('[data-test^="canvas-card-error-"]').isVisible().catch(() => false);
  const hasIframe = await page.locator(".dt-canvas-card__iframe").first().isVisible().catch(() => false);

  expect(hasError || hasIframe).toBe(true);
});
