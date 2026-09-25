import { test, expect } from "@playwright/test";
import { getAppFrame, openEditor } from "@nudge-ui/compatibility/playwright";

// The headless shell rejects pointer lock; full Chromium implements it.
test.use({ channel: "chromium" });

test("dev: spacing stays editable through zero and videos omit inherited text controls", async ({ page }) => {
  await openEditor(page, "/playground");
  const app = await getAppFrame(page);
  await app.addStyleTag({ content: ":root { --visibility-zero: 0px; } .hero h1 { margin: var(--visibility-zero); }" });
  await app.locator(".hero h1").click();
  await expect(page.locator('[data-test="spacing-margin"] [data-test="add-value"]')).toBeVisible();
  const padding = page.locator('[data-test="spacing-padding"]');
  await padding.locator('[data-test="add-value"]').click();
  const field = padding.locator('[data-property="padding-horizontal"]');
  const input = field.locator('[data-test="raw-input"]');
  await input.fill("8px");
  await input.press("Enter");
  await expect(input).toHaveValue("8px");
  const handle = field.locator('[data-test="nudge-handle"]');
  const box = await handle.boundingBox();
  if (!box) throw new Error("Padding drag handle is not visible");
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  const hoverCursor = await handle.evaluate((element) => getComputedStyle(element).cursor);
  expect(hoverCursor).toContain("data:image/svg+xml,");
  await page.mouse.down();
  await expect.poll(() => handle.evaluate((element) =>
    (element.getRootNode() as ShadowRoot).pointerLockElement === element)).toBe(true);
  const cursor = page.locator('[data-test="locked-drag-cursor"]');
  await expect(cursor).toBeVisible();
  const cursorSource = await cursor.getAttribute("src");
  expect(hoverCursor).toContain(cursorSource);
  const cursorBox = await cursor.boundingBox();
  expect(cursorBox?.width).toBe(18);
  expect(cursorBox?.height).toBe(9.5);
  expect(cursorBox?.x).toBeCloseTo(x - 9, 0);
  expect(cursorBox?.y).toBeCloseTo(y - 4, 0);
  await page.mouse.move(x - 16, y);
  expect(await cursor.boundingBox()).toEqual(cursorBox);
  await expect(input).toHaveValue("0px");
  await expect.poll(() => app.locator(".hero h1").evaluate((element) => getComputedStyle(element).paddingLeft)).toBe("0px");
  await page.mouse.move(x - 8, y);
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true);
  await expect(cursor).toHaveCount(0);
  await expect(input).toHaveValue("4px");
  await expect.poll(() => app.locator(".hero h1").evaluate((element) => getComputedStyle(element).paddingLeft)).toBe("4px");
  await page.locator('[data-test="changes-toggle"]').click();
  await page.keyboard.press("Control+z");
  await expect(input).toHaveValue("8px");
  await expect.poll(() => app.locator(".hero h1").evaluate((element) => getComputedStyle(element).paddingLeft)).toBe("8px");
  await page.keyboard.press("Control+Shift+z");
  await expect(input).toHaveValue("4px");

  await app.evaluate(() => {
    const video = document.createElement("video");
    video.id = "visibility-video";
    video.dataset.cid = "VisibilityVideo";
    video.dataset.src = "fixtures/visibility.tsx:1:1";
    video.style.cssText = "display: block; width: 240px; height: 140px; background: gray";
    video.textContent = "Video fallback text";
    document.querySelector(".hero")!.prepend(video);
  });
  await app.locator("#visibility-video").click();
  await expect(page.locator('[data-test="typography"]')).toHaveCount(0);
  await expect(page.locator('[data-test="color-picker"][data-property="color"]')).toHaveCount(0);
  await expect(page.locator('[data-test="color-picker"][data-property="background-color"]')).toBeVisible();
});

for (const end of ["Escape", "blur", "unmount"] as const) {
  test(`dev: field dragging releases pointer lock on ${end}`, async ({ page }) => {
    await openEditor(page, "/playground");
    const app = await getAppFrame(page);
    await app.locator(".hero h1").click();
    const padding = page.locator('[data-test="spacing-padding"]');
    await padding.locator('[data-test="add-value"]').click();
    const field = padding.locator('[data-property="padding-horizontal"]');
    const input = field.locator('[data-test="raw-input"]');
    await input.fill("8px");
    await input.press("Enter");
    const handle = field.locator('[data-test="nudge-handle"]');
    await handle.hover();
    await page.mouse.down();
    await expect.poll(() => handle.evaluate((element) =>
      (element.getRootNode() as ShadowRoot).pointerLockElement === element)).toBe(true);

    if (end === "Escape") await page.keyboard.press("Escape");
    else if (end === "blur") await page.evaluate(() => window.dispatchEvent(new Event("blur")));
    else await app.locator(".hero h1").evaluate((element) => element.remove());

    await expect.poll(() => page.evaluate(() => document.pointerLockElement === null)).toBe(true);
    await expect(page.locator('[data-test="locked-drag-cursor"]')).toHaveCount(0);
    if (end !== "unmount") {
      await expect(page.locator('[data-test="nudge-handle"][data-dragging="true"]')).toHaveCount(0);
      await page.mouse.move(100, 100);
      await expect.poll(() => app.locator(".hero h1").evaluate((element) =>
        getComputedStyle(element).paddingLeft)).toBe("8px");
    }
    await page.mouse.up();
  });
}
