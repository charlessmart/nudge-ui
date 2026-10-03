import { expect, test } from "@playwright/test";

test("dev: MDX prose edits survive replay and revert to their original text", async ({ page, request }) => {
  const html = await (await request.get("/case-study")).text();
  expect(html).toContain('data-src="src/content/case-study.mdx:7:1"');
  expect(html).toContain('data-src="src/content/case-study.mdx:9:1"');
  expect(html).toContain('data-src="src/content/case-study.mdx:11:13"');

  await page.goto("/case-study");
  const app = page.frameLocator(".canvas-card__iframe").first();
  const copy = app.locator('#case-study p[data-src="src/content/case-study.mdx:9:1"]');
  await expect(copy).toHaveText("The sample page contains editable content.");
  await copy.dblclick({ position: { x: 70, y: 10 } });
  const editor = app.locator('[data-inline-editor="true"]');
  await expect(editor).toBeVisible();
  await editor.fill("The sample page contains updated content.");
  await editor.press("Enter");
  await expect(copy).toHaveText("The sample page contains updated content.");

  await page.locator('[data-test="copy-prompt"]').click();
  await expect(page.locator('[data-test="copy-prompt"]')).toHaveAttribute("data-copied", "true");
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain("src/content/case-study.mdx");
  expect(prompt).toContain("The sample page contains editable content.");
  expect(prompt).toContain("The sample page contains updated content.");

  await page.reload();
  await expect(copy).toHaveText("The sample page contains updated content.");
  const changes = page.locator('[data-test="changes-log"]');
  await changes.locator('[data-test="changes-toggle"]').click();
  await expect(changes.locator('[data-test="change-row"]')).toHaveCount(1);
  await changes.locator('[data-test="change-revert"]').click();
  await expect(copy).toHaveText("The sample page contains editable content.");
});
