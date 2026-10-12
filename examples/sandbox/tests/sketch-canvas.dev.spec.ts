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
  // Toolbar clicks move focus outside the sketch dialog.
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

  // Undo restores the erased mark rather than removing the earlier one.
  await page.keyboard.press("ControlOrMeta+z");
  await expect(marks).toHaveCount(2);
  await expect(marks.nth(1)).toHaveAttribute("fill", "#f03e1e");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  await expect(marks).toHaveCount(1);

  // The note keeps its native text undo.
  const note = page.locator('[data-test="sketch-live-prompt-input"]');
  await note.click();
  await page.keyboard.type("Tighten");
  await page.keyboard.press("ControlOrMeta+z");
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
  await page.locator('[data-test="sketch-live-prompt-done"]').click();
  await expect(page.locator('[data-test="sketch-live-editor"]')).toHaveCount(0, { timeout: 10_000 });
  const cards = page.locator(".canvas-card");
  await expect(cards.nth(0).locator('[data-test="canvas-sketch-overlay"]')).toHaveCount(0);
  const overlay = cards.nth(1).locator('[data-test="canvas-sketch-overlay"]');
  await expect(overlay.locator("path")).toHaveCount(1);
  const markBounds = await overlay.locator("path").evaluate((element: SVGGraphicsElement) => {
    const bounds = element.getBBox();
    const width = element.ownerSVGElement!.viewBox.baseVal.width;
    return { left: bounds.x / width, right: (bounds.x + bounds.width) / width };
  });
  expect(markBounds.left).toBeGreaterThan(0.45);
  expect(markBounds.right).toBeLessThan(0.8);
  const beforePan = await second.boundingBox();
  await page.locator('[data-test="canvas-board"]').dispatchEvent("wheel", { deltaX: 40, deltaY: 20, bubbles: true, composed: true });
  await expect.poll(async () => (await second.boundingBox())!.x).toBeCloseTo(beforePan!.x - 40, 1);
  const afterPan = await second.boundingBox();
  const overlayBounds = await overlay.boundingBox();
  expect(overlayBounds!.x).toBeCloseTo(afterPan!.x, 1);
  expect(overlayBounds!.y).toBeCloseTo(afterPan!.y, 1);
  await page.locator('[data-test="changes-toggle"]').click();
  const sketch = page.locator('[data-test="sketch-row"]');
  await expect(sketch.locator(".changes__target")).toHaveText("Sketch");
  await expect(sketch.locator("button")).toHaveCount(1);
  await page.screenshot({ path: test.info().outputPath("sketch-history.png") });
  await sketch.getByRole("button", { name: "Remove sketch" }).click();
  await expect(sketch).toHaveCount(0);
  await expect(overlay).toHaveCount(0);
});
