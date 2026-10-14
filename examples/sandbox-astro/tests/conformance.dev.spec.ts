import { expect, test } from "@playwright/test";
import type { Frame, Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

async function waitForInspector(page: Page): Promise<Frame> {
  await expect(page).toHaveURL(/[?&]nudge-ui=editor(?:&|#|$)/);
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { __nudgeUi?: unknown }).__nudgeUi)))
    .toBe(true);
  await expect.poll(() => page.frames().find((frame) => frame !== page.mainFrame()
    && frame.url().startsWith("http")
    && !frame.url().includes("/__nudge_ui__/editor"))?.url() ?? "").not.toBe("");
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame()
    && candidate.url().startsWith("http")
    && !candidate.url().includes("/__nudge_ui__/editor"));
  if (!frame) throw new Error("Astro preview frame did not become ready");
  return frame;
}

async function copyPrompt(page: Page): Promise<string> {
  await page.locator('[data-test="copy-prompt"]').click();
  await expect(page.locator('[data-test="copy-prompt"]')).toHaveAttribute(
    "data-copied",
    "true",
  );
  return page.evaluate(() => navigator.clipboard.readText());
}

test("dev: static rendered text follows Astro source-annotation capability", async ({ page }) => {
  await page.goto("/");
  const frame = await waitForInspector(page);

  const lede = frame.locator("p.lede");
  await expect(lede).toHaveAttribute("data-cid", "astro:P");
  const sourceIdentity = await lede.getAttribute("data-src");

  if (sourceIdentity !== null) {
    await lede.dblclick();
    const editor = frame.locator('[data-inline-editor="true"]');
    await expect(editor).toBeVisible();
    await editor.fill("Edited live through the inspector");
    await editor.press("Enter");
    await expect(lede).toHaveText("Edited live through the inspector");

    const prompt = await copyPrompt(page);
    expect(prompt).toContain("## Rendered text changes");
    expect(prompt).toMatch(/src\/pages\/index\.astro:\d+:\d+/);
    expect(prompt).not.toContain("data-cid");
  } else {
    // Astro 7's Rust compiler emits no source annotations, so there is no authored location to project an edit to.
    await lede.dblclick();
    await expect(frame.locator('[data-inline-editor="true"]')).toHaveCount(0);
    await expect(lede).toHaveText("A portfolio-shaped fixture for the Nudge UI Astro host Adapter.");
  }

  // Source files stay untouched; the projection lives in the change log.
  const source = await readFile(join(process.cwd(), "src", "pages", "index.astro"), "utf8");
  expect(source).toContain('class="lede">A portfolio-shaped fixture');
});

test("dev: repeated component outputs remain independently selectable", async ({ page }) => {
  const severeErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /nudge-ui/i.test(message.text())) {
      severeErrors.push(message.text());
    }
  });

  await page.goto("/");
  const frame = await waitForInspector(page);

  const cards = frame.locator("article.card");
  await expect(cards).toHaveCount(2);

  // Without source annotations both outputs share the generated identity and must not invent a location.
  for (let index = 0; index < 2; index += 1) {
    await expect(cards.nth(index)).toHaveAttribute("data-cid", "astro:Article");
    const sourceIdentity = await cards.nth(index).getAttribute("data-src");
    if (sourceIdentity !== null) {
      expect(sourceIdentity).toMatch(/src\/components\/Card\.astro:\d+:\d+/);
    }
  }

  await cards.nth(1).click();
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();

  await cards.nth(0).click();
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();

  expect(severeErrors).toEqual([]);
});
