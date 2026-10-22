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

async function openFixture(page: Page) {
  await installExtensionStorage(page);
  await page.route("**/extension-style-selection*", (route) => route.fulfill({
    contentType: "text/html",
    body: `<!doctype html><html><head><style>
      body { margin: 40px; }
      .card { width: 200px; padding: 24px; margin-bottom: 24px; border: 1px solid #ccc;
        border-radius: 16px; font-size: 20px; font-family: sans-serif; }
    </style></head><body>
      <div class="card" id="first">First card</div>
      <div class="card" id="second">Second card</div>
      <div class="card" id="other">Other card</div>
    </body></html>`,
  }));
  await page.goto("/extension-style-selection");
  await page.evaluate(() => {
    Object.assign(window, { __NUDGE_UI_EXTENSION__: { storage: {} } });
  });
  await page.addScriptTag({ content: storageBridge });
  await page.addScriptTag({ content: inspectorBundle });
  await expect(page.locator('[data-test="canvas-tool-design"]')).toBeVisible();
  return page.mainFrame();
}

test("extension multi-selection shows the shared corner radius", async ({ page }) => {
  const content = await openFixture(page);
  await content.locator("#first").click();
  await content.locator("#second").click({ modifiers: ["Shift"] });
  await expect(page.locator('[data-test="canvas-selected-outline"]')).toHaveCount(2);
  const radius = page.locator('[data-test="token-field"][data-property="border-radius"] [data-test="raw-input"]');
  await expect(radius).toHaveValue("16px");
  await expect(page.locator('[data-test="border-radius-editor"]')).toHaveAttribute("data-expanded", "false");
});

for (const { property, value, painted } of [
  { property: "border-radius", value: "0", painted: "0px" },
  { property: "font-size", value: "32", painted: "32px" },
]) {
  test(`extension ${property} group edit stays current after reselection`, async ({ page }) => {
    const content = await openFixture(page);
    await content.locator("#first").click();
    await content.locator("#second").click({ modifiers: ["Shift"] });
    const input = page.locator(`[data-test="token-field"][data-property="${property}"] [data-test="raw-input"]`);
    await expect(page.locator('[data-test="canvas-selected-outline"]')).toHaveCount(2);
    await input.click();
    await input.fill(value);
    await input.press("Enter");

    await expect(content.locator("#first")).toHaveCSS(property, painted);
    await expect(content.locator("#second")).toHaveCSS(property, painted);
    await expect(content.locator("#other")).toHaveCSS(property, property === "border-radius" ? "16px" : "20px");
    await content.locator("#other").click();
    for (const id of ["first", "second"]) {
      await content.locator(`#${id}`).click();
      await expect(input).toHaveValue(painted);
    }
  });
}

for (const { name, css } of [
  { name: "different elements", css: "#second { border-radius: 8px; }" },
  { name: "different corners", css: ".card { border-top-left-radius: 8px; }" },
]) {
  test(`extension radius stays mixed for ${name}`, async ({ page }) => {
    const content = await openFixture(page);
    await content.locator("body").evaluate((_, css) => {
      const style = document.createElement("style");
      style.textContent = css;
      document.head.append(style);
    }, css);
    await content.locator("#first").click();
    await content.locator("#second").click({ modifiers: ["Shift"] });
    await expect(page.locator('[data-test="canvas-selected-outline"]')).toHaveCount(2);
    await expect(page.locator('[data-test="token-field"][data-property="border-radius"] [data-test="raw-input"]')).toHaveValue("Mix");
    await expect(page.locator('[data-test="border-radius-editor"]')).toHaveAttribute("data-expanded", "true");
  });
}
