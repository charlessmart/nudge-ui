import { test, expect, type Page } from "@playwright/test";
import { openEditor } from "@nudge-ui/compatibility/playwright";

/** Marks the page so there is something to copy; the video itself is captured separately. */
async function drawMark(page: Page): Promise<void> {
  const bounds = await page.locator(".sketch__live-canvas").boundingBox();
  if (!bounds) throw new Error("The sketch canvas is missing");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 60, bounds.y + bounds.height / 2 + 40, { steps: 4 });
  await page.mouse.up();
}

test("saves a sketch when the page has a deferred video without a loaded frame", async ({ page }) => {
  const app = await openEditor(page, "/playground?nudge-ui=on");
  await app.locator("body").evaluate((body) => {
    const video = document.createElement("video");
    video.id = "deferred-sketch-video";
    video.preload = "none";
    video.width = 240;
    video.height = 135;
    body.prepend(video);
  });

  await page.locator('[data-test="canvas-tool-sketch"]').click();
  await drawMark(page);
  await page.locator('[data-test="sketch-copy"]').click();

  await expect(page.locator('[data-test="toast"]')).toBeVisible({ timeout: 8_000 });
  await expect(page.locator('[data-test="sketch-recent"]')).toHaveCount(1);
  await expect(app.locator("#deferred-sketch-video")).toHaveAttribute("preload", "none");
  await expect(app.locator("[data-nudge-ui-video-frame]")).toHaveCount(0);
});

test("captures a playing video's current frame without interrupting playback", async ({ page }) => {
  const app = await openEditor(page, "/playground?nudge-ui=on");
  await app.locator("body").evaluate(async (body) => {
    const canvas = document.createElement("canvas");
    canvas.width = 240;
    canvas.height = 135;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "rgb(255, 0, 0)";
    context.fillRect(0, 0, canvas.width, canvas.height);
    const video = document.createElement("video");
    video.id = "playing-sketch-video";
    video.width = 240;
    video.height = 135;
    video.muted = true;
    video.srcObject = canvas.captureStream();
    body.prepend(video);
    const firstFrame = new Promise<void>((resolve) => video.requestVideoFrameCallback(() => resolve()));
    await video.play();
    await firstFrame;
  });
  const position = await app.locator("#playing-sketch-video").evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { x: rect.left + 20, y: rect.top + 20, viewportWidth: window.innerWidth };
  });
  await page.locator('[data-test="canvas-tool-sketch"]').click();
  await drawMark(page);
  await page.locator('[data-test="sketch-copy"]').click();
  await expect(page.locator('[data-test="toast"]')).toBeVisible({ timeout: 8_000 });
  const layer = page.locator('[data-test="sketch-recent"]');
  await expect(layer).toBeVisible();
  const id = await layer.getAttribute("data-sketch-id");
  const pixel = await page.evaluate(async ({ id, point }) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("nudge-ui-sketches");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const saved = await new Promise<{ originalImage: Blob }>((resolve, reject) => {
      const request = database.transaction("documents").objectStore("documents").get(id!);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    const image = await createImageBitmap(saved.originalImage);
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const scale = image.width / point.viewportWidth;
    const pixel = Array.from(context.getImageData(Math.round(point.x * scale), Math.round(point.y * scale), 1, 1).data);
    image.close();
    return pixel;
  }, { id, point: position });
  expect(pixel[0]).toBeGreaterThan(240);
  expect(pixel[1]).toBeLessThan(15);
  expect(pixel[2]).toBeLessThan(15);
  await expect(app.locator("#playing-sketch-video")).toHaveJSProperty("paused", false);
  await expect(app.locator("[data-nudge-ui-video-frame]")).toHaveCount(0);
});
