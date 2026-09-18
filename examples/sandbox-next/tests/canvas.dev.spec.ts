import { expect, test, type Frame, type Page } from "@playwright/test";

function previewFrame(page: Page): Frame | undefined {
  return page.frames().find((frame) => frame !== page.mainFrame()
    && !frame.url().includes("/__nudge_ui__/editor")
    && frame.url().startsWith("http"));
}

async function openEditor(page: Page, path = "/"): Promise<Frame> {
  await page.goto(path);
  await expect(page).toHaveURL(/[?&]nudge-ui=editor(?:&|#|$)/);
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('[data-test^="canvas-card-iframe-"]')).toHaveCount(1);
  await page.locator('[data-test="presentation-canvas"]').click();
  await expect.poll(() => previewFrame(page)?.url() ?? "", { timeout: 45_000 }).toContain(path);
  const frame = previewFrame(page);
  if (!frame) throw new Error("Next preview frame did not become ready");
  await expect(frame.locator("body")).toBeVisible();
  return frame;
}

async function makeWidthEdit(page: Page, frame: Frame, value: string): Promise<void> {
  const target = frame.locator(".hero-card h2");
  await target.click();
  const input = page.locator('[data-test="token-field"][data-property="width"] [data-test="raw-input"]');
  await input.waitFor({ state: "visible", timeout: 20_000 });
  await input.evaluate((element, nextValue) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Missing native input value setter");
    element.focus();
    setter.call(element, nextValue);
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.blur();
  }, value);
  await expect(target).toHaveCSS("width", value);
}

test("dev: editor mounts one live Next renderer card", async ({ page }) => {
  const frame = await openEditor(page);
  await expect(page.locator('[data-test="canvas-board-content"]')).toHaveAttribute("style", /transform/);
  await expect(frame.locator(".hero-card")).toBeVisible();
  await expect(frame.locator(".hero-card")).toHaveAttribute("data-cid", "HeroCard");
});

test("dev: canonical edits project into the Next renderer", async ({ page }) => {
  const frame = await openEditor(page);
  await makeWidthEdit(page, frame, "313px");
  await page.locator('[data-test^="canvas-card-reload-"]').click();
  await expect(previewFrame(page)!.locator(".hero-card h2")).toHaveCSS("width", "313px");
});

test("dev: App Router links navigate the focused renderer without replacing the editor", async ({ page }) => {
  const frame = await openEditor(page);
  await frame.locator('a[href="/second"]').click();
  await expect(page.locator('[data-test^="canvas-card-iframe-"]')).toHaveCount(1);
  await expect.poll(() => previewFrame(page)?.url() ?? "", { timeout: 45_000 }).toMatch(/\/second$/);
  await expect(page).toHaveURL(/[?&]nudge-ui=editor(?:&|#|$)/);
});

test("dev: duplicate keeps a comparison renderer live", async ({ page }) => {
  await openEditor(page);
  await page.locator('[data-test^="canvas-card-duplicate-"]').click();
  await expect(page.locator('[data-test^="canvas-card-iframe-"]')).toHaveCount(2);
  await expect.poll(() => page.frames().filter((frame) => frame !== page.mainFrame()
    && frame.url().startsWith("http")
    && !frame.url().includes("/__nudge_ui__/editor")).length).toBe(2);
});

test("dev: Open app launches a plain direct application page", async ({ page, context }) => {
  await openEditor(page);
  const opened = context.waitForEvent("page");
  await page.locator('[data-test^="canvas-card-open-app-"]').click();
  const appPage = await opened;
  await appPage.waitForLoadState("domcontentloaded");
  await expect(appPage).toHaveURL(/__nudge_ui_direct=1/);
  await expect(appPage.locator(".hero-card")).toBeVisible({ timeout: 30_000 });
  await expect(appPage.locator("#nudge-ui-root")).toHaveCount(0);
});

test("dev: canvas layout and edits survive an editor reload", async ({ page }) => {
  const frame = await openEditor(page);
  await makeWidthEdit(page, frame, "314px");
  await page.locator('[data-test^="canvas-card-duplicate-"]').click();
  await expect(page.locator('[data-test^="canvas-card-iframe-"]')).toHaveCount(2);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible({ timeout: 45_000 });
  await expect(page.locator('[data-test^="canvas-card-iframe-"]')).toHaveCount(2);
  await expect.poll(() => page.frames().filter((candidate) => candidate !== page.mainFrame()
    && candidate.url().startsWith("http")
    && !candidate.url().includes("/__nudge_ui__/editor")).length, { timeout: 45_000 }).toBe(2);
  const restoredFrame = previewFrame(page);
  if (!restoredFrame) throw new Error("Restored Next preview frame did not become ready");
  await expect(restoredFrame.locator(".hero-card h2")).toHaveCSS("width", "314px");
});

test("dev: a second editor cannot take the active workspace lease", async ({ page, context }) => {
  await openEditor(page);
  const second = await context.newPage();
  await second.goto("/second");
  await expect(second).toHaveURL(/[?&]nudge-ui=editor(?:&|#|$)/);
  await expect(second.locator('[data-test="locked-workspace-notice"]')).toBeVisible({ timeout: 30_000 });
  await second.close();
});
