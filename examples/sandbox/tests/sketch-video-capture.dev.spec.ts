import { test, expect } from "@playwright/test";
import { openEditor } from "@nudge-ui/compatibility/playwright";

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
  await page.locator('[data-test="sketch-live-prompt-input"]').fill("Keep this video layout");
  await page.locator('[data-test="sketch-live-prompt-done"]').click();

  await expect(page.locator('[data-test="sketch-layer"]')).toHaveCount(1, { timeout: 8_000 });
  await expect(page.locator('[data-test="sketch-live-editor"]')).toHaveCount(0);
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
  await page.locator('[data-test="sketch-live-prompt-input"]').fill("Keep the playing video frame");
  await page.locator('[data-test="sketch-live-prompt-done"]').click();
  const layer = page.locator('[data-test="sketch-layer"]');
  await expect(layer).toBeVisible({ timeout: 8_000 });
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
