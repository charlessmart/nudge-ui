import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { openEditor } from "@nudge-ui/compatibility/playwright";
import { waitForCanvasTransition } from "./canvasTransition.ts";

interface Point {
  readonly x: number;
  readonly y: number;
}

const MARK = '.sketch__live-canvas [data-test="sketch-svg-layer"] path';
const FRAME = '[data-test="sketch-selection-frame"]';

async function openRectangleSketch(page: Page): Promise<Point> {
  await openEditor(page, "/playground?nudge-ui=on");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).toHaveCount(0);
  await page.locator('[data-test="canvas-tool-sketch"]').click();
  await expect(page.locator('[data-test="sketch-tool-options"]')).toHaveAttribute("data-settled", "true");
  await page.locator('[data-test="sketch-tool-shape"]').click();
  const canvas = await box(page.locator(".sketch__live-canvas"));
  return { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Geometry only: Playwright's own bounding box adds an SVG shape's stroke width. */
function box(locator: Locator): Promise<Box> {
  return locator.evaluate((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    return { x, y, width, height };
  });
}

async function center(locator: Locator): Promise<Point> {
  const bounds = await box(locator);
  return { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
}

async function drag(page: Page, from: Point, to: Point): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

test("a drawn rectangle shows a frame that moves, resizes and rotates it", async ({ page }) => {
  const middle = await openRectangleSketch(page);
  const mark = page.locator(MARK);
  const frame = page.locator(FRAME);
  const canvas = page.locator(".sketch__live-canvas");

  await drag(page, { x: middle.x - 60, y: middle.y - 40 }, { x: middle.x + 60, y: middle.y + 40 });
  await expect(mark).toHaveCount(1);
  await expect(frame).toHaveCount(1);
  await expect(frame.locator('[data-test="sketch-selection-corner"]')).toHaveCount(4);
  await expect(frame.locator('[data-test="sketch-selection-rotate"]')).toHaveCount(1);
  // Handles stay 8 screen pixels wide even though the card is scaled on the board.
  const handle = await box(frame.locator('[data-test="sketch-selection-corner"]').first());
  expect(handle.width).toBeCloseTo(8, 1);

  const drawn = await box(mark);

  // Corners resize: the opposite corner stays put.
  const southEast = frame.locator('[data-test="sketch-selection-corner"]').nth(3);
  await page.mouse.move((await center(southEast)).x, (await center(southEast)).y);
  await expect(canvas).toHaveCSS("cursor", "nwse-resize");
  const grip = await center(southEast);
  await drag(page, grip, { x: grip.x + 40, y: grip.y + 30 });
  const resized = await box(mark);
  expect(resized.x).toBeCloseTo(drawn.x, 0);
  expect(resized.y).toBeCloseTo(drawn.y, 0);
  expect(resized.width).toBeCloseTo(drawn.width + 40, 0);
  expect(resized.height).toBeCloseTo(drawn.height + 30, 0);

  // Edges drag it around and show the drag cursor.
  const border = await box(frame.locator("rect").first());
  const onEdge = { x: border.x + border.width * 0.25, y: border.y };
  await page.mouse.move(onEdge.x, onEdge.y);
  await expect(canvas).toHaveCSS("cursor", "grab");
  await page.mouse.down();
  await page.mouse.move(onEdge.x + 30, onEdge.y + 20, { steps: 6 });
  await expect(canvas).toHaveCSS("cursor", "grabbing");
  await page.mouse.up();
  const moved = await box(mark);
  expect(moved.x).toBeCloseTo(resized.x + 30, 0);
  expect(moved.y).toBeCloseTo(resized.y + 20, 0);
  expect(moved.width).toBeCloseTo(resized.width, 0);

  // The top handle rotates; Shift snaps to a right angle, which swaps the width and height.
  const pivot = await center(mark);
  const rotate = await center(frame.locator('[data-test="sketch-selection-rotate"]'));
  await page.keyboard.down("Shift");
  await drag(page, rotate, { x: pivot.x + 150, y: pivot.y });
  await page.keyboard.up("Shift");
  const rotated = await box(mark);
  expect(rotated.width).toBeCloseTo(moved.height, 0);
  expect(rotated.height).toBeCloseTo(moved.width, 0);

  // Each drag is one undo step.
  await page.keyboard.press("ControlOrMeta+z");
  const unrotated = await box(mark);
  expect(unrotated.width).toBeCloseTo(moved.width, 0);
  await page.keyboard.press("ControlOrMeta+z");
  expect((await box(mark)).x).toBeCloseTo(resized.x, 0);
  await expect(mark).toHaveCount(1);
});

test("a stroke cannot be dragged out of the sketched frame", async ({ page }) => {
  const middle = await openRectangleSketch(page);
  const mark = page.locator(MARK);
  const canvas = await box(page.locator(".sketch__live-canvas"));

  await drag(page, { x: middle.x - 60, y: middle.y - 40 }, { x: middle.x + 60, y: middle.y + 40 });
  const border = await box(page.locator(FRAME).locator("rect").first());
  const onEdge = { x: border.x + border.width * 0.25, y: border.y };
  await drag(page, onEdge, { x: canvas.x + canvas.width + 200, y: onEdge.y });

  const pinned = await box(mark);
  expect(pinned.x + pinned.width).toBeLessThanOrEqual(canvas.x + canvas.width + 1);
  expect(pinned.x + pinned.width).toBeGreaterThan(canvas.x + canvas.width - 2);
});

test("clicking a stroke selects it and clicking empty space clears the selection", async ({ page }) => {
  const middle = await openRectangleSketch(page);
  const mark = page.locator(MARK);
  const frame = page.locator(FRAME);

  await drag(page, { x: middle.x - 220, y: middle.y - 40 }, { x: middle.x - 120, y: middle.y + 40 });
  await drag(page, { x: middle.x + 40, y: middle.y - 40 }, { x: middle.x + 140, y: middle.y + 40 });
  await expect(mark).toHaveCount(2);
  const newest = await box(mark.nth(1));
  expect((await center(frame)).x).toBeCloseTo(newest.x + newest.width / 2, 0);

  await page.mouse.click(middle.x - 170, middle.y);
  await expect(frame).toHaveCount(1);
  const first = await box(mark.first());
  expect((await center(frame)).x).toBeCloseTo(first.x + first.width / 2, 0);

  await page.mouse.click(middle.x - 20, middle.y - 200);
  await expect(frame).toHaveCount(0);
  await expect(mark).toHaveCount(2);
});

test("the eraser works through the frame and hides it", async ({ page }) => {
  const middle = await openRectangleSketch(page);
  const mark = page.locator(MARK);

  await drag(page, { x: middle.x - 60, y: middle.y - 40 }, { x: middle.x + 60, y: middle.y + 40 });
  await expect(page.locator(FRAME)).toHaveCount(1);
  await page.locator('[data-test="sketch-tool-eraser"]').click();
  await expect(page.locator(FRAME)).toHaveCount(0);

  await drag(page, { x: middle.x - 60, y: middle.y - 60 }, { x: middle.x - 60, y: middle.y + 60 });
  await expect(mark).toHaveCount(0);
});
