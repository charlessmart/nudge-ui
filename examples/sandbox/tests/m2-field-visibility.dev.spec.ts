import { test, expect } from "@playwright/test";
import { getAppFrame, openEditor } from "@nudge-ui/compatibility/playwright";

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
  await page.mouse.down();
  await page.mouse.move(x - 16, y);
  await expect(input).toHaveValue("0px");
  await expect.poll(() => app.locator(".hero h1").evaluate((element) => getComputedStyle(element).paddingLeft)).toBe("0px");
  await page.mouse.move(x - 8, y);
  await page.mouse.up();
  await expect(input).toHaveValue("4px");
  await expect.poll(() => app.locator(".hero h1").evaluate((element) => getComputedStyle(element).paddingLeft)).toBe("4px");

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
