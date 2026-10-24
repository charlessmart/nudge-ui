import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test, type Page } from "@playwright/test";
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

async function injectExtension(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.assign(window, { __NUDGE_UI_EXTENSION__: { storage: {} } });
  });
  await page.addScriptTag({ content: storageBridge });
  await page.addScriptTag({ content: inspectorBundle });
  await expect(page.locator('[data-test="collapse-inspector"]')).toBeVisible();
}

test("extension sketches round-trip through extension storage and never touch the site's IndexedDB", async ({ page }) => {
  await page.route("**/extension-sketch-storage", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><body style="margin:0">
      <main style="width:600px;height:400px;background:rgb(200,220,240)"><h1>Sketch me</h1></main>
    </body></html>`,
  }));
  const stored = await installExtensionStorage(page);
  await page.goto("/extension-sketch-storage");
  await injectExtension(page);
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
  await page.bringToFront();

  await page.locator('[data-test="canvas-tool-sketch"]').click();
  const bounds = await page.locator(".sketch__live-canvas").boundingBox();
  if (!bounds) throw new Error("The sketch canvas is missing");
  await page.mouse.move(bounds.x + 100, bounds.y + 100);
  await page.mouse.down();
  await page.mouse.move(bounds.x + 160, bounds.y + 140, { steps: 4 });
  await page.mouse.up();
  await page.locator('[data-test="sketch-copy"]').click();
  await expect(page.locator('[data-test="sketch-recent"]')).toBeVisible({ timeout: 10_000 });

  const origin = new URL(page.url()).origin;
  await expect.poll(() => [...stored.keys()].filter((key) => key.startsWith(`sketch:${origin}|doc:`)).length).toBe(1);
  expect(await page.evaluate(async () => (await indexedDB.databases()).map((database) => database.name))).toEqual([]);

  await page.reload();
  await injectExtension(page);
  await page.locator('[data-test="canvas-tool-sketch"]').click();
  await expect(page.locator('[data-test="sketch-recent"]')).toHaveCount(1);
  expect(await page.evaluate(async () => (await indexedDB.databases()).map((database) => database.name))).toEqual([]);
});
