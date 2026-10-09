import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

let inspectorBundle: string;

test.beforeAll(async () => {
  const extension = new URL("../../../packages/chrome-extension/", import.meta.url);
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL("scripts/build.mjs", extension))]);
  inspectorBundle = await readFile(new URL("dist/nudge-ui.js", extension), "utf8");
});

test("the extension toggle disables page interception and can restart the inspector", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/extension-toggle-fixture", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><title>Extension toggle</title></head><body>
      <button id="action" onclick="this.textContent = 'Clicked'">Save</button>
    </body></html>`,
  }));
  await page.goto("/extension-toggle-fixture");
  await page.evaluate(() => {
    // SAFETY: This is the same page-surface flag the extension sets before injection.
    (window as Window & { __NUDGE_UI_SURFACE__?: string }).__NUDGE_UI_SURFACE__ = "page";
  });
  await page.addScriptTag({ content: inspectorBundle });
  const tool = page.locator('[data-test="canvas-tool-comment"]');
  await expect(tool).toBeVisible();
  await tool.click();
  await page.locator("#action").click();
  await expect(page.locator('[data-test="comment-input"]')).toBeVisible();
  await expect(page.locator("#action")).toHaveText("Save");
  await page.locator('[data-test="comment-input"]').fill("Rename this action");
  await page.locator('[data-test="comment-confirm"]').click();
  await expect(page.locator('[data-test="comment-pin"]')).toBeVisible();

  const toggle = async (): Promise<void> => {
    await page.evaluate(() => {
      // SAFETY: The injected bundle publishes the callback used by the extension icon.
      const loaded = (window as Window & { __NUDGE_UI_BOOKMARKLET__?: { toggle(): void } }).__NUDGE_UI_BOOKMARKLET__;
      if (!loaded) throw new Error("The inspector bundle did not publish its extension toggle.");
      loaded.toggle();
    });
  };
  await toggle();
  await expect(page.locator("#nudge-ui-root")).toHaveCount(0);
  await page.locator("#action").click();
  await expect(page.locator("#action")).toHaveText("Clicked");
  await page.evaluate(() => {
    const button = document.createElement("button");
    button.id = "untouched";
    button.textContent = "Untouched";
    document.body.append(button);
  });
  await page.locator("#untouched").click();
  await expect(page.locator("#untouched")).not.toHaveAttribute("data-cid");
  expect(await page.evaluate(() => Object.keys(localStorage).filter((key) => key.includes("lease")).length)).toBe(0);

  await toggle();
  await expect(tool).toBeVisible();
  await expect(page.locator('[data-test="comment-pin"]')).toBeVisible();
  await tool.click();
  await page.locator("#action").click();
  await expect(page.locator('[data-test="comment-input"]')).toBeVisible();
  await page.locator('[data-test="comment-input"]').press("Escape");
  await toggle();
  await expect(page.locator("#nudge-ui-root")).toHaveCount(0);
  await page.locator("#action").evaluate((button) => { button.textContent = "Save"; });
  await page.locator("#action").click();
  await expect(page.locator("#action")).toHaveText("Clicked");
  expect(errors).toEqual([]);
});
