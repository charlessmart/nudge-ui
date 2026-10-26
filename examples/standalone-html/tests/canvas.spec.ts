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

/**
 * Frame chrome (actions, resize handles) renders only in the canvas presentation.
 * A single-frame project opens focused, so tests that need card actions enter canvas first.
 */
async function showCanvas(page: Page): Promise<void> {
  const show = page.locator('[data-test="canvas-show-canvas"]');
  if (await show.count() > 0) await show.click();
  await expect(page.locator('[data-test^="canvas-card-actions-"]')).toHaveCount(1, { timeout: 15_000 });
}

/** The default element-selection tool consumes pointer events, so links stay inert until this tool is active. */
async function interactWithApp(page: Page): Promise<void> {
  const tool = page.locator('[data-test="canvas-tool-select"]');
  await tool.click();
  await expect(tool).toHaveAttribute("aria-pressed", "true");
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

async function managedSheetText(frame: Frame): Promise<string> {
  return frame.evaluate(() => {
    const sheet = (document.getElementById("nudge-ui-styles") as HTMLStyleElement | null)?.sheet;
    return sheet ? Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n") : "";
  });
}

test("dev: static HTML opens as the live editor renderer", async ({ page }) => {
  const frame = await openEditor(page);
  await expect(page.locator('[data-test^="canvas-card-iframe-"]')).toHaveCount(1);
  await expect(frame.locator("#hero-title")).toBeVisible();
});

test("dev: canonical edits project into the static renderer", async ({ page }) => {
  const frame = await openEditor(page);
  await setWidth(page, frame, "313px");
  await expect(frame.locator("#hero-title")).toHaveCSS("width", "313px");
  // Edits reach the document through the managed stylesheet rather than the host's markup.
  await expect.poll(() => managedSheetText(frame)).toContain("313px");
});

test("dev: static links navigate the focused renderer", async ({ page }) => {
  const frame = await openEditor(page);
  await interactWithApp(page);
  await frame.locator('a[href="/second.html"]').click();
  await expect.poll(() => previewFrame(page)?.url() ?? "", { timeout: 20_000 }).toMatch(/\/second\.html$/);
  await expect(previewFrame(page)!.locator("h1")).toBeVisible();
  await expect(page.locator('[data-test^="canvas-card-iframe-"]')).toHaveCount(1);
});

test("dev: the plain app stays plain across static navigation and reload", async ({ page }) => {
  await openEditor(page);
  // The frame's "Open app" action is gone; opting out is the supported way to reach the plain app.
  const application = await page.context().newPage();
  await application.goto("/?nudge-ui=off");

  await expect(application.locator("#hero-title")).toBeVisible();
  await expect(application.locator("#nudge-ui-root")).toHaveJSProperty("shadowRoot", null);
  await application.locator('a[href="/second.html"]').click();
  await expect(application).toHaveURL(/\/second\.html$/);
  await expect(application.locator("#nudge-ui-root")).toHaveJSProperty("shadowRoot", null);
  await application.reload();
  await expect(application).toHaveURL(/\/second\.html$/);
  await expect(application.locator("#nudge-ui-root")).toHaveJSProperty("shadowRoot", null);
  await application.close();
});

test("dev: static comparison layout and edits survive an editor reload", async ({ page }) => {
  const frame = await openEditor(page);
  await setWidth(page, frame, "314px");
  await showCanvas(page);
  await page.locator('[data-test^="canvas-card-drag-"]').first().hover();
  await page.locator('[data-test^="canvas-card-duplicate-"]').click();
  await expect(page.locator('[data-test^="canvas-card-iframe-"]')).toHaveCount(2);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-test^="canvas-card-iframe-"]')).toHaveCount(2, { timeout: 30_000 });
  await expect.poll(() => page.frames().filter((candidate) => candidate !== page.mainFrame()
    && candidate.url().startsWith("http")
    && !candidate.url().includes("/__nudge_ui__/editor")).length, { timeout: 30_000 }).toBe(2);
  await expect(previewFrame(page)!.locator("#hero-title")).toHaveCSS("width", "314px");
});
