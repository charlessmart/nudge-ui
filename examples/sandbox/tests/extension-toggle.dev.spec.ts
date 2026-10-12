import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { installExtensionStorage } from "./extensionStorage.ts";

let inspectorBundle: string;
let storageBridge: string;

test.beforeAll(async () => {
  const extension = new URL("../../../packages/chrome-extension/", import.meta.url);
  await promisify(execFile)(process.execPath, [fileURLToPath(new URL("scripts/build.mjs", extension))]);
  [inspectorBundle, storageBridge] = await Promise.all([
    readFile(new URL("dist/nudge-ui.js", extension), "utf8"),
    readFile(new URL("dist/storage-bridge.js", extension), "utf8"),
  ]);
});

test("the extension previews selected states with adopted stylesheets and releases them when closed", async ({ page }) => {
  await installExtensionStorage(page);
  await page.route("**/extension-state-fixture", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><style>
      button { background: rgb(10, 20, 30); }
      button:hover { background: rgb(40, 50, 60); }
      button:active { background: rgb(70, 80, 90); }
      button:disabled { background: rgb(100, 110, 120); }
    </style></head><body><button id="action">Save</button></body></html>`,
  }));
  await page.goto("/extension-state-fixture");
  await page.evaluate(() => {
    Object.assign(window, { __NUDGE_UI_EXTENSION__: { storage: {}, surface: "page" } });
  });
  await page.addScriptTag({ content: storageBridge });
  await page.addScriptTag({ content: inspectorBundle });
  await expect(page.locator('[data-test="collapse-inspector"]')).toBeVisible();
  const button = page.locator("#action");
  await button.click();
  const state = page.locator('[data-test="style-state-select"]');
  await state.click();
  await page.locator('[data-value="active"]').click();
  await expect(button).toHaveCSS("background-color", "rgb(70, 80, 90)");
  await state.click();
  await page.locator('[data-value="disabled"]').click();
  await expect(button).toHaveCSS("background-color", "rgb(100, 110, 120)");
  await expect(button).toBeEnabled();
  await page.evaluate(() => {
    const loaded = (window as Window & { __NUDGE_UI_PAGE_INSPECTOR__?: { toggle(): void } }).__NUDGE_UI_PAGE_INSPECTOR__;
    if (!loaded) throw new Error("The extension inspector did not start.");
    loaded.toggle();
  });
  await expect(button).toHaveCSS("background-color", "rgb(10, 20, 30)");
});

test("the extension toggle disables page interception and can restart the inspector", async ({ page }) => {
  await installExtensionStorage(page);
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
    // The service worker publishes this before each top-frame injection.
    Object.assign(window, { __NUDGE_UI_EXTENSION__: { storage: {}, surface: "page" } });
  });
  await page.addScriptTag({ content: storageBridge });
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
      const loaded = (window as Window & { __NUDGE_UI_PAGE_INSPECTOR__?: { toggle(): void } }).__NUDGE_UI_PAGE_INSPECTOR__;
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
