import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";
import { openEditor } from "@nudge-ui/compatibility/playwright";
import { waitForCanvasTransition } from "./canvasTransition.ts";

interface Point {
  readonly x: number;
  readonly y: number;
}

const MARK = '.sketch__live-canvas [data-test="sketch-svg-layer"] path';
const TEXT = '.sketch__live-canvas [data-test="sketch-text-layer"]';
const FRAME = '[data-test="sketch-selection-frame"]';
const EDITOR = '[data-test="sketch-text-editor"]';

/** Opens the sketch tool without waiting for the toolbar's intro, so animations can be inspected. */
async function startSketch(page: Page): Promise<Point> {
  await openEditor(page, "/playground?nudge-ui=on");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).toHaveCount(0);
  await page.locator('[data-test="canvas-tool-sketch"]').click();
  const canvas = await box(page.locator(".sketch__live-canvas"));
  return { x: canvas.x + canvas.width / 2, y: canvas.y + canvas.height / 2 };
}

async function openSketch(page: Page): Promise<Point> {
  const middle = await startSketch(page);
  await expect(page.locator('[data-test="sketch-tool-options"]')).toHaveAttribute("data-settled", "true");
  return middle;
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

async function typeText(page: Page, at: Point, text: string): Promise<void> {
  await page.locator('[data-test="sketch-tool-text"]').click();
  await page.mouse.click(at.x, at.y);
  await expect(page.locator(EDITOR)).toBeFocused();
  await page.keyboard.type(text);
  await page.keyboard.press("Enter");
  await expect(page.locator(EDITOR)).toHaveCount(0);
}

test("the sketch tools sit in a bar above the toolbar with screenshot and clear after the color", async ({ page }) => {
  await startSketch(page);
  const bar = page.locator('[data-test="sketch-tool-options"]');
  await expect(bar).toBeVisible();

  // The whole bar slides up 16px as it fades in (it is centred with `translate`, so the slide carries the -50%).
  const slide = await bar.evaluate((element) => {
    const animation = element.getAnimations().find((candidate) => (candidate as CSSAnimation).animationName === "sketch-options-bar-in");
    const [first] = (animation?.effect as KeyframeEffect | null | undefined)?.getKeyframes() ?? [];
    return first ? { translate: String(first.translate), opacity: Number(first.opacity) } : null;
  });
  expect(slide).toEqual({ translate: "-50% 16px", opacity: 0 });

  // Each control rises in turn: one intro animation per item, delayed one step after the last.
  const delays = await page.locator(".sketch__live-popup, .sketch-options__item").evaluateAll((elements) =>
    elements
      .filter((element) => element.classList.contains("sketch-options__item"))
      .map((element) => element.getAnimations().map((animation) => {
        const timing = animation.effect?.getTiming();
        return { name: (animation as CSSAnimation).animationName, delay: Number(timing?.delay) };
      })[0]));
  expect(delays).toHaveLength(7);
  expect(delays.every((item) => item?.name === "sketch-options-item-in")).toBe(true);
  const steps = delays.map((item) => item!.delay);
  expect(steps).toEqual([...steps].sort((first, second) => first - second));
  expect(new Set(steps).size).toBe(steps.length);

  // While the controls rise in, they are clipped to the bar so the pen and eraser artwork never hangs below it; the clip is dropped afterwards so the color palette can fan out past the bar.
  const items = page.locator(".sketch-options__items");
  await expect(bar).toHaveAttribute("data-settled", "false");
  await expect(items).toHaveCSS("clip-path", /^inset\(/);
  await expect(bar).toHaveAttribute("data-settled", "true");
  await expect(items).toHaveCSS("clip-path", "none");
  const toolbar = await box(page.locator('[data-test="canvas-toolbar"]'));
  const sketchBar = await box(bar);
  expect(sketchBar.y + sketchBar.height).toBeLessThanOrEqual(toolbar.y);
  expect(sketchBar.y + sketchBar.height).toBeGreaterThan(toolbar.y - 24);

  const order = ["pen", "eraser", "text", "shape", "color"].map((tool) => `[data-test="sketch-tool-${tool}"]`);
  order.push('[data-test="sketch-screenshot"]', '[data-test="sketch-clear"]');
  const lefts = await Promise.all(order.map(async (selector) => (await box(page.locator(selector))).x));
  expect(lefts).toEqual([...lefts].sort((first, second) => first - second));

  // A divider, like the one in the canvas toolbar, sits between the color picker and the page actions.
  const divider = page.locator('[data-test="sketch-options-divider"]');
  await expect(divider).toHaveCount(1);
  const dividerBox = await box(divider);
  const colorBox = await box(page.locator('[data-test="sketch-tool-color"]'));
  const screenshotBox = await box(page.locator('[data-test="sketch-screenshot"]'));
  expect(dividerBox.x).toBeGreaterThan(colorBox.x + colorBox.width);
  expect(dividerBox.x + dividerBox.width).toBeLessThan(screenshotBox.x);
  expect(dividerBox.width).toBe(1);
  expect(dividerBox.height).toBe(24);
  expect(dividerBox.y + dividerBox.height / 2).toBeCloseTo(screenshotBox.y + screenshotBox.height / 2, 0);
  const toolbarDivider = await box(page.locator('[data-test="canvas-toolbar"] > .canvas-toolbar__divider'));
  expect(dividerBox.height).toBe(toolbarDivider.height);

  // Screenshot and clear are icon buttons with tooltips; with nothing drawn, there is nothing to clear.
  await expect(page.locator('[data-test="sketch-screenshot"]')).toBeEnabled();
  await expect(page.locator('[data-test="sketch-screenshot"]')).toHaveAccessibleName("Screenshot");
  await expect(page.locator('[data-test="sketch-clear"]')).toBeDisabled();
  await expect(page.locator('[data-test="sketch-clear"]')).toHaveAccessibleName("Clear all marks");
});

test("typed text becomes a layer that is framed, rotated and scaled like a stroke", async ({ page }) => {
  const middle = await openSketch(page);
  await typeText(page, { x: middle.x - 100, y: middle.y }, "Tighten spacing");

  const layer = page.locator(TEXT);
  await expect(layer).toHaveText("Tighten spacing");
  const frame = page.locator(FRAME);
  await expect(frame).toHaveCount(1);
  await expect(frame.locator('[data-test="sketch-selection-corner"]')).toHaveCount(4);
  await expect(page.locator('[data-test="sketch-clear"]')).toBeEnabled();

  const before = Number(await layer.getAttribute("font-size"));
  const typed = await box(layer);
  const grip = await center(frame.locator('[data-test="sketch-selection-corner"]').nth(3));
  await drag(page, grip, { x: grip.x + 60, y: grip.y + 30 });
  const grown = Number(await layer.getAttribute("font-size"));
  expect(grown).toBeGreaterThan(before);
  expect((await box(layer)).width).toBeGreaterThan(typed.width);
  expect((await box(layer)).x).toBeCloseTo(typed.x, 0);

  const pivot = await center(layer);
  const rotate = await center(frame.locator('[data-test="sketch-selection-rotate"]'));
  await page.keyboard.down("Shift");
  await drag(page, rotate, { x: pivot.x + 150, y: pivot.y });
  await page.keyboard.up("Shift");
  await expect(layer).toHaveAttribute("transform", /rotate\(90\.00\)/);
  await expect(frame).toHaveAttribute("transform", /rotate\(90\)/);
});

test("the shape button opens a menu of rectangle, circle and arrow, and remembers the last one", async ({ page }) => {
  const middle = await openSketch(page);
  const shape = page.locator('[data-test="sketch-tool-shape"]');
  await expect(shape).toHaveAttribute("data-shape", "rectangle");

  await page.locator('[data-test="sketch-shape-menu"]').click();
  await page.locator('[data-test="sketch-shape-ellipse"]').click();
  await expect(shape).toHaveAttribute("data-active", "true");
  await expect(shape).toHaveAttribute("data-shape", "ellipse");
  await drag(page, { x: middle.x - 80, y: middle.y - 60 }, { x: middle.x + 40, y: middle.y + 20 });
  await expect(page.locator(MARK)).toHaveCount(1);
  await expect(page.locator(FRAME)).toBeVisible();

  await page.locator('[data-test="sketch-tool-pen"]').click();
  await expect(shape).toHaveAttribute("data-active", "false");
  await expect(shape).toHaveAttribute("data-shape", "ellipse");

  await page.locator('[data-test="sketch-shape-menu"]').click();
  await page.locator('[data-test="sketch-shape-arrow"]').click();
  await drag(page, { x: middle.x - 80, y: middle.y + 60 }, { x: middle.x + 80, y: middle.y + 90 });
  await expect(page.locator(MARK)).toHaveCount(2);
});

test("typed text sits on a white note with a shadow", async ({ page }) => {
  const middle = await openSketch(page);
  await typeText(page, middle, "hello");
  const note = page.locator('.sketch__live-canvas [data-test="sketch-text-note"]');
  await expect(note).toHaveCount(1);
  await expect(note).toHaveAttribute("fill", "#fff");
  await expect(page.locator(MARK)).toHaveCount(0);
});

test("P, E, R, I, L and T pick the pen, eraser, rectangle, circle, arrow and text tools, except while typing text", async ({ page }) => {
  const middle = await openSketch(page);
  const isActive = (tool: string) => expect(page.locator(`[data-test="sketch-tool-${tool}"]`)).toHaveAttribute("data-active", "true");

  // P goes back to the pen without starting a new sketch, so what is already drawn stays.
  await drag(page, { x: middle.x - 80, y: middle.y - 60 }, { x: middle.x + 40, y: middle.y + 20 });
  await expect(page.locator(MARK)).toHaveCount(1);
  await page.keyboard.press("e");
  await isActive("eraser");
  await page.keyboard.press("p");
  await isActive("pen");
  await expect(page.locator(MARK)).toHaveCount(1);
  await expect(page.locator('[data-test="sketch-tool-options"]')).toHaveCount(1);
  await page.locator('[data-test="sketch-tool-pen"]').hover();
  await expect(page.locator(".tooltip__popup", { hasText: "Pen" })).toContainText("P");
  await page.keyboard.press("e");
  await isActive("eraser");
  await page.keyboard.press("r");
  await isActive("shape");
  await expect(page.locator('[data-test="sketch-tool-shape"]')).toHaveAttribute("data-shape", "rectangle");
  await page.keyboard.press("i");
  await expect(page.locator('[data-test="sketch-tool-shape"]')).toHaveAttribute("data-shape", "ellipse");
  await page.keyboard.press("l");
  await expect(page.locator('[data-test="sketch-tool-shape"]')).toHaveAttribute("data-shape", "arrow");
  await page.keyboard.press("t");
  await isActive("text");

  // The tooltips name the keys.
  await page.locator('[data-test="sketch-tool-eraser"]').hover();
  await expect(page.locator(".tooltip__popup", { hasText: "Eraser" })).toContainText("E");

  // While a text layer is being typed, the same letters are just letters.
  await page.mouse.click(middle.x, middle.y);
  await expect(page.locator(EDITOR)).toBeFocused();
  await page.keyboard.type("rer");
  await isActive("text");
  await expect(page.locator(EDITOR)).toHaveValue("rer");
  await page.keyboard.press("Escape");

  // Modifier chords are not shortcuts, and nothing listens once the sketch tool is closed.
  await page.keyboard.press("ControlOrMeta+e");
  await isActive("text");
  await page.locator('[data-test="canvas-tool-design"]').click();
  await expect(page.locator('[data-test="sketch-tool-options"]')).toHaveCount(0);
  await page.keyboard.press("e");
  await expect(page.locator('[data-test="sketch-tool-options"]')).toHaveCount(0);
});

test("Escape abandons the text being typed without closing the sketch", async ({ page }) => {
  const middle = await openSketch(page);
  await page.locator('[data-test="sketch-tool-text"]').click();
  await page.mouse.click(middle.x, middle.y);
  await expect(page.locator(EDITOR)).toBeFocused();
  await page.keyboard.type("Never mind");
  await page.keyboard.press("Escape");

  await expect(page.locator(EDITOR)).toHaveCount(0);
  await expect(page.locator(TEXT)).toHaveCount(0);
  await expect(page.locator('[data-test="sketch-live-editor"]')).toHaveCount(1);
  await expect(page.locator('[data-test="sketch-screenshot"]')).toBeEnabled();
});

test("choosing another tool while typing keeps the text", async ({ page }) => {
  const middle = await openSketch(page);
  await page.locator('[data-test="sketch-tool-text"]').click();
  await page.mouse.click(middle.x - 100, middle.y);
  await expect(page.locator(EDITOR)).toBeFocused();
  await page.keyboard.type("Keep me");

  await page.locator('[data-test="sketch-tool-pen"]').click();
  await expect(page.locator(EDITOR)).toHaveCount(0);
  await expect(page.locator(TEXT)).toHaveText("Keep me");
  await expect(page.locator('[data-test="sketch-clear"]')).toBeEnabled();
});

test("clicking away from the text editor finishes the text without starting another box", async ({ page }) => {
  const middle = await openSketch(page);
  await page.locator('[data-test="sketch-tool-text"]').click();
  await page.mouse.click(middle.x - 100, middle.y);
  const editor = page.locator(EDITOR);
  await expect(editor).toBeFocused();
  await page.keyboard.type("Finish on click");

  // The first click outside commits the text and is consumed; it must not open a second editor.
  await page.mouse.click(middle.x + 140, middle.y + 100);
  await expect(editor).toHaveCount(0);
  await expect(page.locator(TEXT)).toHaveText("Finish on click");
  await expect(page.locator(TEXT)).toHaveCount(1);
});

test("double-clicking a text layer edits it and undo restores the old words", async ({ page }) => {
  const middle = await openSketch(page);
  await typeText(page, { x: middle.x - 100, y: middle.y }, "First");
  const layer = page.locator(TEXT);
  await expect(layer).toHaveText("First");

  await page.locator('[data-test="sketch-tool-pen"]').click();
  const target = await center(layer);
  await page.mouse.dblclick(target.x, target.y);
  const editor = page.locator(EDITOR);
  await expect(editor).toHaveValue("First");
  await page.keyboard.type(" and second");
  await page.keyboard.press("Enter");

  await expect(layer).toHaveText("First and second");
  await expect(page.locator(TEXT)).toHaveCount(1);
  await page.keyboard.press("ControlOrMeta+z");
  await expect(layer).toHaveText("First");
});
