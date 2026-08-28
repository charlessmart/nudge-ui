import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Stage 6 conformance (docs/features/astro-host-adapter.md): portfolio-shaped
 * coverage for the Astro host Adapter — conservative rendered-text editing
 * with prompt handoff, and repeated component outputs sharing one source site.
 */

async function waitForInspector(page: Page): Promise<void> {
  await expect
    .poll(() => page.evaluate(() => Boolean(document.getElementById("nudge-ui-root"))))
    .toBe(true);
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { __nudgeUi?: unknown }).__nudgeUi)))
    .toBe(true);
}

async function copyPrompt(page: Page): Promise<string> {
  await page.locator('[data-test="copy-prompt"]').click();
  await expect(page.locator('[data-test="copy-prompt"]')).toHaveAttribute(
    "data-copied",
    "true",
  );
  return page.evaluate(() => navigator.clipboard.readText());
}

test("dev: rendered-text edits project to prompts with authored .astro coordinates", async ({ page }) => {
  await page.goto("/");
  await waitForInspector(page);

  const lede = page.locator("p.lede");
  await lede.dblclick();
  const editor = page.locator('[data-inline-editor="true"]');
  await expect(editor).toBeVisible();
  await editor.fill("Edited live through the inspector");
  await editor.press("Enter");
  await expect(lede).toHaveText("Edited live through the inspector");

  const prompt = await copyPrompt(page);
  expect(prompt).toContain("## Rendered text changes");
  // The lede is authored directly in index.astro, so its response-layer
  // identity carries exact coordinates into the prompt.
  expect(prompt).toMatch(/src\/pages\/index\.astro:\d+:\d+/);
  expect(prompt).not.toContain("data-cid");

  // Source files stay untouched; the projection lives in the change log.
  const source = await readFile(join(process.cwd(), "src", "pages", "index.astro"), "utf8");
  expect(source).toContain('class="lede">A portfolio-shaped fixture');
});

test("dev: repeated component outputs keep distinct selectable identity at one source site", async ({ page }) => {
  const severeErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /nudge-ui/i.test(message.text())) {
      severeErrors.push(message.text());
    }
  });

  await page.goto("/");
  await waitForInspector(page);

  const cards = page.locator("article.card");
  await expect(cards).toHaveCount(2);

  // Both outputs share their component callsite identity...
  for (let index = 0; index < 2; index += 1) {
    await expect(cards.nth(index)).toHaveAttribute("data-cid", "astro:Article");
    await expect(cards.nth(index)).toHaveAttribute(
      "data-src",
      /src\/components\/Card\.astro:\d+:\d+/,
    );
  }

  // ...and each remains independently selectable, with the style editors
  // targeting the selected output.
  await cards.nth(1).click();
  await expect(page.locator('[data-test="selection"]')).toHaveAttribute(
    "data-selected-cid",
    "astro:Article",
  );
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();

  // Selecting the first output re-targets the panel without stale state.
  await cards.nth(0).click();
  await expect(page.locator('[data-test="selection"]')).toHaveAttribute(
    "data-selected-cid",
    "astro:Article",
  );
  await expect(page.locator('[data-test="selection"]')).toHaveAttribute(
    "data-selected-src",
    /src\/components\/Card\.astro:\d+:\d+/,
  );

  expect(severeErrors).toEqual([]);
});
