import { expect, test, type Frame, type Page } from "@playwright/test";

function previewFrame(page: Page): Frame | undefined {
  return page.frames().find((frame) => frame !== page.mainFrame()
    && frame.url().startsWith("http")
    && !frame.url().includes("/__nudge_ui__/editor"));
}

async function openEditor(page: Page): Promise<Frame> {
  await page.goto("/");
  await expect(page).toHaveURL(/[?&]nudge-ui=editor(?:&|#|$)/);
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible({ timeout: 30_000 });
  await expect.poll(() => previewFrame(page)?.url() ?? "", { timeout: 30_000 }).toMatch(/\/$/);
  const frame = previewFrame(page);
  if (!frame) throw new Error("Static HTML preview frame did not become ready");
  return frame;
}

async function setWidth(page: Page, frame: Frame, value: string): Promise<void> {
  const title = frame.locator("#hero-title");
  await title.click();
  const input = page.locator('[data-test="token-field"][data-property="width"] [data-test="raw-input"]');
  await input.waitFor({ state: "visible", timeout: 15_000 });
  await input.evaluate((element, nextValue) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Missing native input value setter");
    element.focus();
    setter.call(element, nextValue);
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.blur();
  }, value);
  await expect(title).toHaveCSS("width", value);
}

test("dev: static HTML opens as the live editor renderer", async ({ page }) => {
  const frame = await openEditor(page);
  await expect(page.locator('[data-test^="canvas-card-iframe-"]')).toHaveCount(1);
  await expect(frame.locator("#hero-title")).toBeVisible();
});

test("dev: canonical edits project into the static renderer", async ({ page }) => {
  const frame = await openEditor(page);
  await setWidth(page, frame, "313px");
  await page.locator('[data-test^="canvas-card-reload-"]').click();
  await expect.poll(() => previewFrame(page)?.url() ?? "", { timeout: 20_000 }).toMatch(/\/$/);
  await expect(previewFrame(page)!.locator("#hero-title")).toHaveCSS("width", "313px");
});

test("dev: static links navigate the focused renderer", async ({ page }) => {
  const frame = await openEditor(page);
  await frame.locator('a[href="/second.html"]').click();
  await expect.poll(() => previewFrame(page)?.url() ?? "", { timeout: 20_000 }).toMatch(/\/second\.html$/);
  await expect(previewFrame(page)!.locator("h1")).toBeVisible();
  await expect(page.locator('[data-test^="canvas-card-iframe-"]')).toHaveCount(1);
});

test("dev: Open app stays plain across static navigation and reload", async ({ page }) => {
  await openEditor(page);
  const popupPromise = page.waitForEvent("popup");
  await page.locator('[data-test^="canvas-card-open-app-"]').click();
  const application = await popupPromise;

  await expect(application.locator("#hero-title")).toBeVisible();
  await expect(application.locator("#nudge-ui-root")).toHaveJSProperty("shadowRoot", null);
  await application.locator('a[href="/second.html"]').click();
  await expect(application).toHaveURL(/\/second\.html$/);
  await expect(application.locator("#nudge-ui-root")).toHaveJSProperty("shadowRoot", null);
  await application.reload();
  await expect(application).toHaveURL(/\/second\.html$/);
  await expect(application.locator("#nudge-ui-root")).toHaveJSProperty("shadowRoot", null);
});

test("dev: static comparison layout and edits survive an editor reload", async ({ page }) => {
  const frame = await openEditor(page);
  await setWidth(page, frame, "314px");
  await page.locator('[data-test^="canvas-card-duplicate-"]').click();
  await expect(page.locator('[data-test^="canvas-card-iframe-"]')).toHaveCount(2);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-test^="canvas-card-iframe-"]')).toHaveCount(2, { timeout: 30_000 });
  await expect.poll(() => page.frames().filter((candidate) => candidate !== page.mainFrame()
    && candidate.url().startsWith("http")
    && !candidate.url().includes("/__nudge_ui__/editor")).length, { timeout: 30_000 }).toBe(2);
  await expect(previewFrame(page)!.locator("#hero-title")).toHaveCSS("width", "314px");
});
