import { expect, test } from "@playwright/test";
import { openEditor } from "@nudge-ui/compatibility/playwright";
import { clickFrameAction, waitForCanvasTransition } from "./canvasTransition.ts";

test("a live sketch blocks canvas pan and zoom until it closes", async ({ page }) => {
  await openEditor(page, "/playground?nudge-ui=on");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).toHaveCount(0);
  const content = page.locator('[data-test="canvas-board-content"]');
  const camera = () => content.evaluate((element) => getComputedStyle(element).transform);
  const before = await camera();
  await page.locator('[data-test="canvas-tool-sketch"]').click();
  const bounds = await page.locator(".sketch__live-canvas").boundingBox();
  if (!bounds) throw new Error("The sketch canvas is missing");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 40, bounds.y + bounds.height / 2 + 20, { steps: 4 });
  await page.mouse.up();
  const mark = page.locator('.sketch__live-canvas [data-test="sketch-svg-layer"] path');
  await expect(mark).toHaveCount(1);
  const path = await mark.getAttribute("d");
  await page.mouse.wheel(60, 90);
  await page.locator('[data-test="canvas-board"]').dispatchEvent("wheel", { deltaY: 100, ctrlKey: true, bubbles: true, composed: true });
  await page.locator('[data-test="canvas-board"]').dispatchEvent("wheel", { deltaX: 60, deltaY: 90, bubbles: true, composed: true });
  expect(await camera()).toBe(before);
  await expect(mark).toHaveAttribute("d", path!);
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-test="sketch-live-editor"]')).toHaveCount(0);
  await page.locator('[data-test="canvas-board"]').dispatchEvent("wheel", { deltaY: 90, bubbles: true, composed: true });
  await expect.poll(camera).not.toBe(before);
});

test("undo and redo follow drawing and erasing after toolbar clicks", async ({ page }) => {
  await openEditor(page, "/playground?nudge-ui=on");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).toHaveCount(0);
  await page.locator('[data-test="canvas-tool-sketch"]').click();
  await expect(page.locator('[data-test="sketch-tool-options"]')).toHaveAttribute("data-settled", "true");
  const bounds = await page.locator(".sketch__live-canvas").boundingBox();
  if (!bounds) throw new Error("The sketch canvas is missing");
  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;
  async function drawAt(y: number): Promise<void> {
    await page.mouse.move(centerX - 40, y);
    await page.mouse.down();
    await page.mouse.move(centerX + 40, y, { steps: 6 });
    await page.mouse.up();
  }
  const marks = page.locator('.sketch__live-canvas [data-test="sketch-svg-layer"] path');

  await drawAt(centerY - 40);
  // Toolbar clicks move focus out of the sketch dialog.
  await page.locator('[data-test="sketch-tool-color"]').click();
  await page.locator('[data-test="sketch-color-red"]').click();
  await drawAt(centerY + 40);
  await expect(marks).toHaveCount(2);
  await expect(marks.nth(1)).toHaveAttribute("fill", "#f03e1e");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(marks).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(marks).toHaveCount(2);

  await page.locator('[data-test="sketch-tool-eraser"]').click();
  await page.mouse.move(centerX, centerY + 20);
  await page.mouse.down();
  await page.mouse.move(centerX, centerY + 60, { steps: 6 });
  await page.mouse.up();
  await expect(marks).toHaveCount(1);
  await expect(marks.first()).not.toHaveAttribute("fill", "#f03e1e");

  await page.keyboard.press("ControlOrMeta+z");
  await expect(marks).toHaveCount(2);
  await expect(marks.nth(1)).toHaveAttribute("fill", "#f03e1e");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(marks).toHaveCount(1);

  // Text being typed keeps its native undo instead of undoing a stroke.
  await page.locator('[data-test="sketch-tool-text"]').click();
  await page.mouse.click(centerX - 120, centerY + 140);
  const typing = page.locator('[data-test="sketch-text-editor"]');
  await expect(typing).toBeFocused();
  await page.keyboard.type("Tighten");
  await expect(typing).toHaveValue("Tighten");
  await page.keyboard.press("ControlOrMeta+z");
  // The browser undoes typing in chunks, so only the direction matters.
  await expect(typing).not.toHaveValue("Tighten");
  await expect(marks).toHaveCount(1);
});

test("the first stroke targets another frame without selecting an application element", async ({ page }) => {
  await openEditor(page, "/playground?nudge-ui=on");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await clickFrameAction(page, page.locator('[data-test^="canvas-card-duplicate-"]').first());
  await expect(page.locator(".canvas-card__iframe")).toHaveCount(2);
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).toHaveCount(0);
  await page.frameLocator(".canvas-card__iframe").nth(1).locator("body").evaluate(() => { location.assign("/conformance"); });
  await expect.poll(() => page.frameLocator(".canvas-card__iframe").nth(1).locator("body").evaluate(() => location.pathname)).toBe("/conformance");
  for (let step = 0; step < 80; step += 1) {
    await page.locator('[data-test="canvas-board"]').dispatchEvent("wheel", {
      deltaY: 100, ctrlKey: true, clientX: 480, clientY: 360, bubbles: true, composed: true,
    });
  }
  await clickFrameAction(page, page.locator('[data-test^="canvas-card-drag-"]').first());
  await page.locator('[data-test="canvas-tool-sketch"]').click();
  const second = page.locator(".canvas-card__iframe").nth(1);
  const bounds = await second.boundingBox();
  if (!bounds) throw new Error("The second frame is missing");
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 30, bounds.y + bounds.height / 2 + 20, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator('.sketch__live-canvas [data-test="sketch-svg-layer"] path')).toHaveCount(1);
  await expect(page.locator('[data-test="selection"]')).toHaveCount(0);
  await page.locator('[data-test="sketch-copy"]').click();
  // The copy was taken from the frame that was drawn on, not from the first one.
  const recent = page.locator('[data-test="sketch-recent"]');
  await expect(recent).toBeVisible({ timeout: 10_000 });
  const id = await recent.getAttribute("data-sketch-id");
  const capturedPath = await page.evaluate(async (sketchId) => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("nudge-ui-sketches");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const saved = await new Promise<{ capture: { url: string } }>((resolve, reject) => {
      const request = database.transaction("documents").objectStore("documents").get(sketchId!);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return new URL(saved.capture.url).pathname;
  }, id);
  expect(capturedPath).toBe("/conformance");

  // Nothing is left drawn on either frame, and the copied sketch is not listed as a change.
  await expect(page.locator('.sketch__live-canvas [data-test="sketch-svg-layer"] path')).toHaveCount(0);
  await expect(page.locator('[data-test="canvas-sketch-overlay"]')).toHaveCount(0);
  await expect(page.locator('[data-test="sketch-row"]')).toHaveCount(0);
  await expect(page.locator('[data-test="sketch-live-editor"]')).toHaveCount(1);
});
