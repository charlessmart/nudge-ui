import { test, expect, type Page } from "@playwright/test";
import { openEditor } from "@nudge-ui/compatibility/playwright";
import { showCanvas } from "./canvasTransition.ts";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

async function openFrames(page: Page): Promise<void> {
  await page.locator('[data-test="navigator-expand"]').click();
  await expect(page.locator('[data-test="navigator-frames"]')).toBeVisible();
}

async function openAddPage(page: Page): Promise<void> {
  await page.locator('[data-test="navigator-add-page"]').click();
  await expect(page.locator('[data-test="navigator-add-page-menu"]')).toBeVisible();
}

test.describe("Add page", () => {
  test("copies agent instructions for writing artifacts", async ({ page }) => {
    await openEditor(page, "/playground?nudge-ui=editor");
    await openFrames(page);
    await openAddPage(page);
    await page.locator('[data-test="navigator-copy-agent-instructions"]').click();

    await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toContain(".nudge/artifacts/<uuid>/");
    const instructions = await page.evaluate(() => navigator.clipboard.readText());
    expect(instructions).toContain('"viewport"');
    expect(instructions).toContain("/pricing");
    expect(instructions).toContain("36-character UUID");
  });

  test("lists a saved iteration and adds it at its captured size", async ({ page, request }) => {
    const id = crypto.randomUUID();
    await openEditor(page, "/playground?nudge-ui=editor");
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
    await showCanvas(page);
    await openFrames(page);
    await openAddPage(page);

    const item = page.locator(`[data-test="navigator-iteration-${id}"]`);
    await expect(item).toContainText("Saved iteration");
    await item.click();

    const cards = page.locator(".canvas-card");
    await expect(cards).toHaveCount(2);
    await expect(cards.nth(1)).toHaveAttribute("aria-label", /Iteration 1/);
    await expect(cards.nth(1).locator("iframe")).toHaveAttribute("src", new RegExp(`/artifacts/${id}/preview`));
    await request.delete(`/__nudge_ui__/artifacts/${id}`);
  });
});
