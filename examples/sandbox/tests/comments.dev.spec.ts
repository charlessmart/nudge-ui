import { test, expect } from "@playwright/test";
import { openEditor } from "@nudge-ui/compatibility/playwright";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

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
