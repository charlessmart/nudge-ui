import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";
import { waitForCanvasTransition } from "./canvasTransition.ts";
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

for (const navigation of ["document", "client-side"]) {
  test(`extension ${navigation} focus navigation keeps one frame and canvas links add a frame`, async ({ page }) => {
    await installExtensionStorage(page);
    await page.route("**/extension-navigation-*", (route) => route.fulfill({
      contentType: "text/html",
      body: `<!doctype html><html><head><title>Navigation fixture</title>
        <style>body { padding: 120px; } a { display: block; margin: 24px; }</style></head><body>
        <a href="/extension-navigation-case-study">Case study</a>
        <a href="/extension-navigation-index">Index</a>
      </body></html>`,
    }));
    await page.goto("/extension-navigation-index?nudge-ui=editor");
    await page.evaluate(() => {
      Object.assign(window, { __NUDGE_UI_EXTENSION__: { storage: {}, surface: "editor" } });
    });
    await page.addScriptTag({ content: storageBridge });
    await page.addScriptTag({ content: inspectorBundle });
    const cards = page.locator(".canvas-card");
    await expect(cards).toHaveCount(1);
    const id = await cards.first().getAttribute("data-card-id");
    const renderer = () => page.frames().find((frame) => frame.parentFrame() === page.mainFrame())!;
    // Reproduce the service worker's injection after each renderer document loads.
    await renderer().addScriptTag({ content: inspectorBundle });
    await expect(cards.first().locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible();
    await page.locator('[data-test="canvas-tool-select"]').click();
    const content = cards.first().locator("iframe").contentFrame();
    if (navigation === "client-side") {
      await content.getByRole("link", { name: "Case study", exact: true }).evaluate((link) => {
        link.addEventListener("click", (event) => {
          event.preventDefault();
          history.pushState(null, "", "/extension-navigation-case-study");
        });
      });
    }
    await content.getByRole("link", { name: "Case study", exact: true }).click();
    await expect.poll(() => renderer().url()).toContain("/extension-navigation-case-study");
    await renderer().addScriptTag({ content: inspectorBundle });
    await expect(page).toHaveURL(/\/extension-navigation-case-study\?nudge-ui=editor$/);
    await content.locator("body").evaluate(() => {
      window.addEventListener("message", (event) => {
        if (event.data?.type === "link-target-state") {
          document.body.dataset.linksOpenInCards = String(event.data.openInCard);
        }
      });
    });
    await page.locator('[data-test="canvas-show-canvas"]').click();
    await waitForCanvasTransition(page);
    await expect(cards).toHaveCount(1);
    await expect(cards.first()).toHaveAttribute("data-card-id", id!);
    await expect.poll(() => renderer().url()).toContain("/extension-navigation-case-study");

    await expect(content.locator("body")).toHaveAttribute("data-links-open-in-cards", "true");
    await content.getByRole("link", { name: "Index", exact: true }).click();
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toHaveAttribute("data-card-id", id!);
    await expect.poll(() => content.locator("body").evaluate(() => location.pathname)).toBe("/extension-navigation-case-study");
  });
}
