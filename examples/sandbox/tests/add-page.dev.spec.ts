import { test, expect } from "@playwright/test";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("adds an application route once and focuses the frame already showing it", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await page.locator('[data-test="canvas-show-canvas"]').click();

  const cards = page.locator(".canvas-card");
  await expect(cards).toHaveCount(1);

  await page.locator('[data-test="canvas-add-page"]').click();
  await page.locator('[data-test="canvas-add-page-route"]').fill("/examples");
  await page.locator('[data-test="canvas-add-page-submit"]').click();

  await expect(page.locator('[data-test="canvas-add-page-menu"]')).not.toBeVisible();
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(1).locator("iframe")).toHaveAttribute("src", /\/examples/);

  await page.locator('[data-test="canvas-add-page"]').click();
  await page.locator('[data-test="canvas-add-page-route"]').fill("/examples");
  await page.locator('[data-test="canvas-add-page-submit"]').click();

  await expect(cards).toHaveCount(2);
  await expect(cards.nth(1)).toHaveClass(/is-selected/);
});

test("rejects cross-origin routes", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await page.locator('[data-test="canvas-add-page"]').click();

  await page.locator('[data-test="canvas-add-page-route"]').fill("https://example.com/pricing");
  await page.locator('[data-test="canvas-add-page-submit"]').click();

  await expect(page.locator('[data-test="canvas-add-page-menu"]')).toBeVisible();
  await expect(page.getByRole("alert")).toContainText("Only pages from this app can be added.");
  await expect(page.locator(".canvas-card")).toHaveCount(1);
});

test("copies agent instructions for writing artifacts", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await page.locator('[data-test="canvas-add-page"]').click();
  await page.locator('[data-test="canvas-copy-agent-instructions"]').click();

  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()))
    .toContain(".nudge/artifacts/<uuid>/");
  const instructions = await page.evaluate(() => navigator.clipboard.readText());
  expect(instructions).toContain('"viewport"');
  expect(instructions).toContain("/pricing");
  expect(instructions).toContain("36-character UUID");
});

test("lists a saved iteration and adds it at its captured size", async ({ page, request }) => {
  const id = crypto.randomUUID();
  await page.goto("/playground");
  const origin = new URL(page.url()).origin;
  const created = await request.post("/__nudge_ui__/artifacts", {
    data: {
      id,
      html: "<!doctype html><html><body><h1>Saved iteration</h1></body></html>",
      sourceUrl: `${origin}/examples`,
      title: "Saved iteration",
      viewport: { width: 900, height: 640 },
    },
  });
  expect(created.status()).toBe(201);

  await page.reload();
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await page.locator('[data-test="canvas-add-page"]').click();

  const item = page.locator(`[data-test="canvas-add-iteration-${id}"]`);
  await expect(item).toContainText("Saved iteration");
  await item.click();

  const cards = page.locator(".canvas-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(1).locator(".canvas-card__dimensions")).toContainText("Iteration 1");
  await expect(cards.nth(1).locator("iframe")).toHaveAttribute("src", new RegExp(`/artifacts/${id}/preview`));
  await request.delete(`/__nudge_ui__/artifacts/${id}`);
});
