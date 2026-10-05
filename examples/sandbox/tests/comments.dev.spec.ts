import { test, expect } from "@playwright/test";
import { openEditor } from "@nudge-ui/compatibility/playwright";
import { waitForCanvasTransition } from "./canvasTransition.ts";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("settings cover comment pins and closing settings restores pin interaction", async ({ page }) => {
  const app = await openEditor(page, "/playground?nudge-ui=on");
  await page.locator('[data-test="canvas-tool-comment"]').click();
  await app.locator("#hero-title").click();
  await page.locator('[data-test="comment-input"]').fill("Keep this note behind settings");
  await page.locator('[data-test="comment-confirm"]').click();
  const pin = page.locator('[data-test="comment-pin"]');
  await expect(pin).toBeVisible();

  await page.locator('[data-test="settings-button"]').click();
  await expect(page.locator('[data-test="settings-dialog"]')).toBeVisible();
  await expect.poll(() => pin.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const root = element.getRootNode() as ShadowRoot;
    const hit = root.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return Boolean(hit?.closest('[data-test="settings-dialog"], [data-test="settings-backdrop"]'));
  })).toBe(true);

  await page.locator('[data-test="settings-close"]').click();
  await expect(page.locator('[data-test="settings-dialog"]')).toHaveCount(0);
  await pin.click();
  await expect(page.locator('[data-test="comment-input"]')).toHaveValue("Keep this note behind settings");
});

test("scrolling over comment pins pans the canvas and pins track it between animation frames", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-05T00:00:00Z") });
  const app = await openEditor(page, "/playground?nudge-ui=on");
  await page.locator('[data-test="canvas-tool-comment"]').click();
  await app.locator("#hero-title").click();
  await page.locator('[data-test="comment-input"]').fill("Follow this heading");
  await page.locator('[data-test="comment-confirm"]').click();
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  await app.locator("body").evaluate(() => window.scrollTo(0, 0));
  const pin = page.locator('[data-test="comment-pin"]');
  await expect(pin).toBeVisible();
  await page.clock.pauseAt(new Date("2026-10-05T00:10:00Z"));
  await page.clock.runFor(32);
  const before = await pin.boundingBox();
  expect(before).not.toBeNull();

  await pin.dispatchEvent("wheel", {
    deltaX: 27, deltaY: 19, bubbles: true, composed: true,
  });
  await page.clock.runFor(32);

  const after = await pin.boundingBox();
  expect(after).not.toBeNull();
  expect(after!.x - before!.x).toBeCloseTo(-27, 1);
  expect(after!.y - before!.y).toBeCloseTo(-19, 1);
});

test("focus view shows one comment pin when the route has duplicate frames", async ({ page }) => {
  const app = await openEditor(page, "/playground?nudge-ui=on");
  await page.locator('[data-test="canvas-tool-comment"]').click();
  await app.locator("#hero-title").click();
  await page.locator('[data-test="comment-input"]').fill("One note across duplicate frames");
  await page.locator('[data-test="comment-confirm"]').click();
  const pins = page.locator('[data-test="comment-pin"]');
  await expect(pins).toHaveCount(1);

  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  const cards = page.locator(".canvas-card");
  await cards.first().hover();
  await cards.first().getByRole("button", { name: "Duplicate", exact: true }).click();
  await expect(cards).toHaveCount(2);
  await waitForCanvasTransition(page);
  // Selecting the heading can scroll the original frame. Keep its anchor in view.
  await app.locator("body").evaluate(() => window.scrollTo(0, 0));
  await expect(pins).toHaveCount(2);

  await cards.nth(1).hover();
  await cards.nth(1).getByRole("button", { name: "Focus", exact: true }).click();
  await waitForCanvasTransition(page);
  await expect(pins).toHaveCount(1);
  await pins.click();
  await expect(page.locator('[data-test="comment-input"]')).toHaveValue("One note across duplicate frames");
  await page.locator('[data-test="comment-input"]').press("Escape");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  await expect(pins).toHaveCount(2);
});

test("comments persist, export target context, and resolve after a handed-off element changes", async ({ page }) => {
  const app = await openEditor(page, "/playground");
  await page.locator('[data-test="canvas-tool-comment"]').click();
  await expect(page.locator('[data-test="canvas-tool-pan"]')).toHaveCount(0);
  const heading = app.locator("#hero-title");
  await heading.click();
  await expect(page.locator('[data-test="comment-input"]')).toBeVisible();
  await expect(page.locator('[data-test="comment-confirm"]')).toBeDisabled();
  await page.locator('[data-test="comment-input"]').fill("Make this heading more welcoming");
  await page.screenshot({ path: "/tmp/nudge-comment-editor.png" });
  await page.locator('[data-test="comment-confirm"]').click();
  await expect(page.locator('[data-test="comment-editor"]')).toHaveCount(0);
  await expect(page.locator('[data-test="comment-pin"]')).toBeVisible();
  await page.reload();
  await expect(page.locator('[data-test="comment-pin"]')).toBeVisible();
  await page.locator('[data-test="copy-prompt"]').click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain("## Element comments");
  expect(prompt).toContain("Make this heading more welcoming");
  expect(prompt).toContain("/playground");
  await page.reload();
  await expect(page.locator('[data-test="comment-pin"]')).toBeVisible();
  await page.frameLocator(".canvas-card__iframe").first().locator("#hero-title").click();
  const fontSize = page.locator('[data-test="token-field"][data-property="font-size"] [data-test="raw-input"]');
  await fontSize.fill("64px");
  await fontSize.press("Enter");
  await expect(page.frameLocator(".canvas-card__iframe").first().locator("#hero-title")).toHaveCSS("font-size", "64px");
  await page.reload();
  await expect(page.locator('[data-test="comment-pin"]')).toBeVisible();
  await page.frameLocator(".canvas-card__iframe").first().locator("#hero-title").evaluate((element) => {
    element.textContent = "Welcome to your workspace";
  });
  await expect(page.locator('[data-test="comment-pin"]')).toHaveCount(0);
});

test("comment mode does not open inline editing or move elements", async ({ page }) => {
  const app = await openEditor(page, "/playground");
  await page.locator('[data-test="canvas-tool-comment"]').click();
  const heading = app.locator("#hero-title");
  await heading.dblclick();
  await expect(page.locator('[data-test="comment-input"]')).toBeVisible();
  await expect(heading).not.toHaveAttribute("contenteditable", "true");
  await page.locator('[data-test="comment-input"]').press("Escape");
  await expect(page.locator('[data-test="comment-editor"]')).toHaveCount(0);
  await expect(page.locator('[data-test="comment-pin"]')).toHaveCount(0);
  await heading.click();
  await page.locator('[data-test="comment-input"]').fill("Discard this draft");
  await page.mouse.click(20, 500);
  await expect(page.locator('[data-test="comment-editor"]')).toHaveCount(0);
  await expect(page.locator('[data-test="comment-pin"]')).toHaveCount(0);
});

test("comments survive taking ownership back after another tab adds a note", async ({ page, context }) => {
  await openEditor(page, "/playground");
  await page.locator('[data-test="canvas-tool-comment"]').click();
  await page.frameLocator(".canvas-card__iframe").first().locator("#hero-title").click();
  await page.locator('[data-test="comment-input"]').fill("First tab note");
  await page.locator('[data-test="comment-confirm"]').click();
  await expect(page.locator('[data-test="comment-pin"]')).toHaveCount(1);

  const second = await context.newPage();
  await second.goto(page.url());
  await second.locator('[data-test="takeover-here"]').click();
  await expect(page.locator('[data-test="locked-workspace-notice"]')).toBeVisible();
  await second.locator('[data-test="canvas-tool-comment"]').click();
  await second.frameLocator(".canvas-card__iframe").first().locator("#hero-title").click();
  await second.locator('[data-test="comment-input"]').fill("Second tab note");
  await second.locator('[data-test="comment-confirm"]').click();
  await expect(second.locator('[data-test="comment-pin"]')).toHaveCount(2);

  await page.locator('[data-test="takeover-here"]').click();
  await expect(page.locator('[data-test="comment-pin"]')).toHaveCount(2);
  await page.locator('[data-test="copy-prompt"]').click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain("First tab note");
  expect(prompt).toContain("Second tab note");
  await second.close();
  await page.reload();
  await expect(page.locator('[data-test="comment-pin"]')).toHaveCount(2);
});
