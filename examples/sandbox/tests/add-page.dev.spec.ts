import { test, expect } from "@playwright/test";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("opens the artifact-only Add page menu from the inspector empty state", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await page.locator('[data-test="canvas-show-canvas"]').click();

  await expect(page.locator('[data-test="empty-state"]')).toBeVisible();
  const addPage = page.locator('[data-test="canvas-add-page"]');
  await expect(addPage).toHaveClass(/button--secondary/);
  await expect(addPage).toHaveClass(/button--default/);
  await addPage.click();

  await expect(page.locator('[data-test="canvas-add-page-menu"]')).toBeVisible();
  await expect(page.locator('[data-test="canvas-add-page-route"]')).toHaveCount(0);
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
  await expect(cards.nth(1)).toHaveAttribute("aria-label", /Iteration 1/);
  await expect(cards.nth(1).locator("iframe")).toHaveAttribute("src", new RegExp(`/artifacts/${id}/preview`));
  await request.delete(`/__nudge_ui__/artifacts/${id}`);
});
