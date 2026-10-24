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

test("the sketch tools sit in a bar above the toolbar with the copy button after the color", async ({ page }) => {
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
  expect(delays).toHaveLength(6);
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

  const order = ["pen", "eraser", "rectangle", "text", "color"].map((tool) => `[data-test="sketch-tool-${tool}"]`);
  order.push('[data-test="sketch-copy"]');
  const lefts = await Promise.all(order.map(async (selector) => (await box(page.locator(selector))).x));
  expect(lefts).toEqual([...lefts].sort((first, second) => first - second));

  await expect(page.locator('[data-test="sketch-copy"]')).toBeEnabled();
  // With nothing drawn, the button stays as it is and a plain toast (no icon) says what to do instead.
  await page.locator('[data-test="sketch-copy"]').click();
  const toast = page.locator('[data-test="toast"]');
  await expect(toast).toContainText("Draw a sketch, then save");
  await expect(toast.locator(".toast__icon")).toHaveCount(0);
  await expect(page.locator('[data-test="sketch-live-prompt-input"]')).toHaveCount(0);

  // A divider, like the one in the canvas toolbar, sits between the color picker and the copy button.
  const divider = page.locator('[data-test="sketch-options-divider"]');
  await expect(divider).toHaveCount(1);
  const dividerBox = await box(divider);
  const colorBox = await box(page.locator('[data-test="sketch-tool-color"]'));
  const copyBox = await box(page.locator('[data-test="sketch-copy"]'));
  expect(dividerBox.x).toBeGreaterThan(colorBox.x + colorBox.width);
  expect(dividerBox.x + dividerBox.width).toBeLessThan(copyBox.x);
  expect(dividerBox.width).toBe(1);
  expect(dividerBox.height).toBe(24);
  expect(dividerBox.y + dividerBox.height / 2).toBeCloseTo(copyBox.y + copyBox.height / 2, 0);
  const toolbarDivider = await box(page.locator('[data-test="canvas-toolbar"] > .canvas-toolbar__divider'));
  expect(dividerBox.height).toBe(toolbarDivider.height);
  expect(await divider.evaluate((element) => getComputedStyle(element).backgroundColor))
    .toBe(await page.locator('[data-test="canvas-toolbar"] > .canvas-toolbar__divider').evaluate((element) => getComputedStyle(element).backgroundColor));

  // The save button is a labeled primary button with the tick icon, and there is no clear button beside it.
  const copyButton = page.locator('[data-test="sketch-copy"]');
  await expect(copyButton).toHaveText("Save");
  await expect(copyButton.locator("svg")).toHaveCount(1);
  const copy = await box(copyButton);
  expect(copy.height).toBe(32);
  expect(copy.width).toBeGreaterThan(32);
  await expect(page.locator('[data-test="sketch-clear"]')).toHaveCount(0);
});

test("typed text becomes a layer that is framed, rotated and scaled like a stroke", async ({ page }) => {
  const middle = await openSketch(page);
  await typeText(page, { x: middle.x - 100, y: middle.y }, "Tighten spacing");

  const layer = page.locator(TEXT);
  await expect(layer).toHaveText("Tighten spacing");
  const frame = page.locator(FRAME);
  await expect(frame).toHaveCount(1);
  await expect(frame.locator('[data-test="sketch-selection-corner"]')).toHaveCount(4);
  await expect(page.locator('[data-test="sketch-copy"]')).toBeEnabled();

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

test("P, E, R and T pick the pen, eraser, rectangle and text tools, except while typing text", async ({ page }) => {
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
  await isActive("rectangle");
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
  await expect(page.locator('[data-test="sketch-copy"]')).toBeEnabled();
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
  await expect(page.locator('[data-test="sketch-copy"]')).toBeEnabled();
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

async function grantClipboard(page: Page): Promise<void> {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
  await page.bringToFront();
}

/** The MIME types on the first clipboard item, or `[]` when it holds only text. */
function clipboardTypes(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const [item] = await navigator.clipboard.read();
    return item ? [...item.types] : [];
  });
}

function storedSketchIds(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("nudge-ui-sketches");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const documents = await new Promise<{ id: string }[]>((resolve, reject) => {
      const request = database.transaction("documents").objectStore("documents").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return documents.map((document) => document.id);
  });
}

async function copyTextSketch(page: Page, at: Point, text: string): Promise<void> {
  await typeText(page, at, text);
  await page.locator('[data-test="sketch-copy"]').click();
  await expect(page.locator(TEXT)).toHaveCount(0, { timeout: 10_000 });
}

/** Clicks the stack of saved sketches beside the save button, which opens them into a grid of large cards above the bar. */
async function openSketchGrid(page: Page): Promise<void> {
  await page.locator('[data-test="sketch-recent-copy"]').first().click();
  await expect(page.locator('[data-test="sketch-grid"]')).toBeVisible();
  // Let the cards finish growing out of their thumbnails before anything is measured.
  await page.waitForFunction(() => {
    const root = document.getElementById("nudge-ui-root")!.shadowRoot!;
    return root.querySelector('[data-test="sketch-grid"]')?.getAnimations({ subtree: true }).length === 0;
  });
}

test("copy sketch clears the canvas, keeps the tool open, and leaves the copy out of the prompt", async ({ page }) => {
  const middle = await openSketch(page);
  await grantClipboard(page);
  await typeText(page, { x: middle.x - 100, y: middle.y }, "Nudge this");
  await page.locator('[data-test="sketch-copy"]').click();

  const recent = page.locator('[data-test="sketch-recent"]');
  await expect(recent).toBeVisible({ timeout: 10_000 });
  await expect(page.locator(TEXT)).toHaveCount(0);
  await expect(page.locator(MARK)).toHaveCount(0);
  await expect(page.locator(FRAME)).toHaveCount(0);
  await expect(page.locator('[data-test="sketch-copy"]')).toBeEnabled();
  await expect(page.locator('[data-test="sketch-live-editor"]')).toHaveCount(1);
  expect(await clipboardTypes(page)).toContain("image/png");

  // A copied sketch is not a change: nothing is drawn on the page, listed in Changes, or added to the prompt.
  await expect(page.locator('[data-test="canvas-sketch-overlay"]')).toHaveCount(0);
  await expect(page.locator('[data-test="sketch-row"]')).toHaveCount(0);
  await expect(page.locator('[data-test="copy-prompt-change-count"]')).toHaveCount(0);
  await expect(page.locator('[data-test="copy-prompt-menu"]')).toHaveCount(0);
  await expect(page.locator('[data-test="copy-prompt"]')).toBeEnabled();

  // The saved sketch sits inside the bar, just left of the save button.
  // (Measured once it has finished popping in and sliding into place.)
  await recent.evaluate((element) => Promise.all(element.getAnimations().map((animation) => animation.finished)));
  const bar = await box(page.locator('[data-test="sketch-tool-options"]'));
  const stacked = await box(recent);
  const save = await box(page.locator('[data-test="sketch-copy"]'));
  expect(stacked.y).toBeGreaterThanOrEqual(bar.y);
  expect(stacked.y + stacked.height).toBeLessThanOrEqual(bar.y + bar.height);
  expect(stacked.x + stacked.width).toBeLessThanOrEqual(save.x);
});

test("clicking the stack opens a grid of large sketches, clicking one copies it and closes the grid, and remove deletes it", async ({ page }) => {
  const middle = await openSketch(page);
  await grantClipboard(page);
  await copyTextSketch(page, { x: middle.x - 100, y: middle.y }, "Forgot to paste");
  const stack = page.locator('[data-test="sketch-recent"]');
  await expect(stack).toBeVisible();
  const grid = page.locator('[data-test="sketch-grid"]');
  const card = page.locator('[data-test="sketch-recent-card"]');
  const remove = page.locator('[data-test="sketch-recent-remove"]');

  // Stacked, there is no grid. Clicking the stack opens it above the bar without moving the bar.
  await expect(grid).toHaveCount(0);
  const restingBar = await box(page.locator('[data-test="sketch-tool-options"]'));
  await openSketchGrid(page);
  expect(await box(page.locator('[data-test="sketch-tool-options"]'))).toEqual(restingBar);
  await expect(card).toHaveCount(1);
  // The sketches are out on the page, so the stack leaves an empty place in the bar.
  await expect(stack).toHaveCSS("opacity", "0");
  await expect(grid).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  const shown = await box(grid);
  expect(shown.y + shown.height).toBeLessThanOrEqual(restingBar.y);
  expect(restingBar.y - (shown.y + shown.height)).toBeLessThan(24);
  const image = await box(card.locator("canvas.sketch-grid__image"));
  expect(image.width).toBeGreaterThan(200);
  expect(image.width).toBeLessThanOrEqual(400);
  expect(image.height).toBeLessThanOrEqual(500);

  // The copy icon and the remove button appear while the card is hovered.
  const icon = card.locator(".sketch-grid__copy-action");
  await expect(icon).toHaveCSS("opacity", "0");
  await expect(remove).toHaveCSS("opacity", "0");
  await card.hover();
  await expect(icon).toHaveCSS("opacity", "1");
  await expect(icon).toHaveText("Copy sketch");
  await expect(remove).toHaveCSS("opacity", "1");

  // Clicking it puts the image back on the clipboard after something else replaced it, and closes the grid.
  await page.evaluate(() => navigator.clipboard.writeText("something else"));
  expect(await clipboardTypes(page)).not.toContain("image/png");
  await card.locator('[data-test="sketch-recent-card-copy"]').click();
  await expect.poll(() => clipboardTypes(page)).toContain("image/png");
  await expect(grid).toHaveCount(0);
  await expect(stack).toHaveCSS("opacity", "1");

  // Pressing outside the grid closes it too.
  await openSketchGrid(page);
  await page.mouse.click(middle.x - 300, middle.y);
  await expect(grid).toHaveCount(0);

  // The remove button deletes the stored sketch.
  await openSketchGrid(page);
  expect(await storedSketchIds(page)).toHaveLength(1);
  await card.hover();
  await remove.click();
  await expect(stack).toHaveCount(0);
  await expect(page.locator('[data-test="sketch-recents"]')).toHaveCount(0);
  await expect(grid).toHaveCount(0);
  expect(await storedSketchIds(page)).toEqual([]);
  await expect(page.locator('[data-test="sketch-live-editor"]')).toHaveCount(1);
});

test("four saved sketches open into a two by two grid, which reflows to one column on a narrow screen", async ({ page }) => {
  const middle = await openSketch(page);
  await grantClipboard(page);
  for (const [index, words] of ["One", "Two", "Three", "Four"].entries()) {
    await copyTextSketch(page, { x: middle.x - 100, y: middle.y - 80 + index * 40 }, words);
  }
  await expect(page.locator('[data-test="sketch-recent"]')).toHaveCount(4);
  await page.waitForTimeout(500);

  await openSketchGrid(page);
  const cards = page.locator('[data-test="sketch-recent-card"]');
  await expect(cards).toHaveCount(4);
  const boxes = await Promise.all([0, 1, 2, 3].map((index) => box(cards.nth(index))));
  expect(boxes[1]!.x).toBeGreaterThan(boxes[0]!.x + boxes[0]!.width - 1);
  expect(Math.abs(boxes[1]!.y - boxes[0]!.y)).toBeLessThan(2);
  expect(boxes[2]!.y).toBeGreaterThan(boxes[0]!.y + boxes[0]!.height - 1);
  expect(Math.abs(boxes[3]!.x - boxes[1]!.x)).toBeLessThan(2);
  for (const card of boxes) expect(card.width).toBeLessThanOrEqual(400);
  const grid = page.locator('[data-test="sketch-grid"]');
  expect(await grid.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);

  // With the panel open, a short 800px screen leaves the canvas under 640px wide, so the cards stack in one column and shrinks the pictures to fit, with no scrolling.
  await page.setViewportSize({ width: 800, height: 700 });
  await expect.poll(async () => {
    const [first, second] = await Promise.all([box(cards.nth(0)), box(cards.nth(1))]);
    return second.y > first.y + first.height - 1 && Math.abs(second.x - first.x) < 2;
  }).toBe(true);
  const column = await box(grid);
  expect(column.x).toBeGreaterThanOrEqual(0);
  expect(column.x + column.width).toBeLessThanOrEqual(800);
  expect(column.width).toBeGreaterThan(200);
  expect(column.y).toBeGreaterThanOrEqual(0);
  expect(await grid.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
});

test("the color palette fans out above the saved sketches", async ({ page }) => {
  const middle = await openSketch(page);
  await grantClipboard(page);
  await copyTextSketch(page, { x: middle.x - 100, y: middle.y }, "Palette over me");
  await expect(page.locator('[data-test="sketch-recent"]')).toBeVisible();

  await page.locator('[data-test="sketch-tool-color"]').click();
  await expect(page.locator(".sketch-options__palette-option")).toHaveCount(6);
  await page.waitForFunction(() => {
    const root = document.getElementById("nudge-ui-root")!.shadowRoot!;
    return [...root.querySelectorAll(".sketch-options__palette-option")].every((option) => option.getAnimations().length === 0);
  });

  // Sample the ring of every swatch: none of it may sit under a saved sketch.
  const covered = await page.evaluate(() => {
    const root = document.getElementById("nudge-ui-root")!.shadowRoot!;
    const hidden: string[] = [];
    for (const option of root.querySelectorAll(".sketch-options__palette-option")) {
      const bounds = option.getBoundingClientRect();
      for (let step = 0; step < 16; step += 1) {
        const angle = (step * Math.PI) / 8;
        const x = bounds.x + bounds.width / 2 + Math.cos(angle) * bounds.width * 0.45;
        const y = bounds.y + bounds.height / 2 + Math.sin(angle) * bounds.height * 0.45;
        if (root.elementFromPoint(x, y)?.closest(".sketch-recents")) hidden.push(`${option.getAttribute("data-test")}@${step}`);
      }
    }
    return hidden;
  });
  expect(covered).toEqual([]);
});

test("the four latest copies are kept, newest in front, and they are still there after a reload", async ({ page }) => {
  const middle = await openSketch(page);
  await grantClipboard(page);
  const recent = page.locator('[data-test="sketch-recent"]');
  const recentIds = () => recent.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-sketch-id")));

  // Newest first, as the bar lists them.
  const copies: string[] = [];
  for (const [index, words] of ["First copy", "Second copy", "Third copy", "Fourth copy", "Fifth copy"].entries()) {
    await copyTextSketch(page, { x: middle.x - 100, y: middle.y - 80 + index * 40 }, words);
    await expect.poll(async () => (await recentIds())[0]).not.toBe(copies[0] ?? null);
    copies.unshift((await recentIds())[0]!);
  }

  const kept = copies.slice(0, 4);
  await expect(recent).toHaveCount(4);
  expect(await recentIds()).toEqual(kept);
  expect([...await storedSketchIds(page)].sort()).toEqual([...kept].sort());

  // The oldest has fully left.
  await expect(page.locator('[data-test="sketch-recent-leaving"]')).toHaveCount(0);

  // Opened, the newest card comes last in the grid, so it stays on top as it was in the stack.
  await openSketchGrid(page);
  expect(await page.locator('[data-test="sketch-recent-card"]').evaluateAll((elements) => elements.map((element) => element.getAttribute("data-sketch-id")))).toEqual([...kept].reverse());

  await page.reload();
  await page.locator('[data-test="canvas-tool-sketch"]').click();
  await expect(recent).toHaveCount(4);
  expect(await recentIds()).toEqual(kept);
});

/** What the thumbnail's entrance looked like, frame by frame, from the moment it appeared. */
interface PopSample {
  readonly scale: number;
  readonly opacity: number;
  readonly animation: string | null;
}

test("a finished copy pops its sketch in behind the bar, with nothing flying across the page", async ({ page }) => {
  const middle = await openSketch(page);
  await typeText(page, { x: middle.x - 100, y: middle.y }, "Pop");

  // Watch for the thumbnail and for any picture appearing outside the sketch bar, from before the copy.
  await page.evaluate(() => {
    const root = document.getElementById("nudge-ui-root")!.shadowRoot!;
    const samples: unknown[] = [];
    const strays: string[] = [];
    Object.assign(window, { __popSamples: samples, __strayImages: strays, __popDone: false });
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (!(node instanceof Element)) continue;
          const images = node instanceof HTMLImageElement ? [node] : [...node.querySelectorAll("img")];
          for (const image of images) if (!image.closest(".sketch-options")) strays.push(image.className || "img");
        }
      }
    }).observe(root, { childList: true, subtree: true });
    let frames = 0;
    const tick = (): void => {
      const item = root.querySelector<HTMLElement>('.sketch-recent[data-enter="true"]');
      if (item) {
        const style = getComputedStyle(item);
        samples.push({
          scale: style.scale === "none" ? 1 : Number(style.scale.split(" ")[0]),
          opacity: Number(style.opacity),
          animation: (item.getAnimations()[0] as CSSAnimation | undefined)?.animationName ?? null,
        });
      }
      frames += 1;
      if (samples.length > 0 && !item?.getAnimations().length) {
        Object.assign(window, { __popDone: true });
        return;
      }
      if (frames < 600) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await page.locator('[data-test="sketch-copy"]').click();
  await page.waitForFunction(() => (window as unknown as { __popDone: boolean }).__popDone, undefined, { timeout: 10_000 });
  const { samples, strays } = await page.evaluate(() => ({
    samples: (window as unknown as { __popSamples: PopSample[] }).__popSamples,
    strays: (window as unknown as { __strayImages: string[] }).__strayImages,
  }));

  // The thumbnail scales up from small while fading in, overshoots a touch, and settles at full size...
  const animated = samples.filter((sample) => sample.animation === "sketch-options-pop");
  expect(animated.length).toBeGreaterThan(5);
  expect(animated[0]!.scale).toBeLessThan(0.7);
  expect(animated[0]!.opacity).toBeLessThan(0.5);
  expect(Math.max(...animated.map((sample) => sample.scale))).toBeGreaterThan(1);
  expect(animated.at(-1)!.scale).toBeCloseTo(1, 1);
  // ...and no screenshot flies anywhere.
  expect(samples.every((sample) => sample.animation === null || sample.animation === "sketch-options-pop")).toBe(true);
  expect(strays).toEqual([]);
  await expect(page.locator('[data-test="sketch-flight"]')).toHaveCount(0);
  await expect(page.locator('[data-test="sketch-recent"]')).toBeVisible();
});

test("copying announces itself with a white toast that sits above the sketch bar", async ({ page }) => {
  const middle = await openSketch(page);
  await grantClipboard(page);
  await typeText(page, { x: middle.x - 100, y: middle.y }, "Announce me");
  await page.locator('[data-test="sketch-copy"]').click();

  const toast = page.locator('[data-test="toast"]');
  await expect(toast).toContainText("Copied to clipboard");
  // Hovering waits for the toast to be the topmost thing under the pointer, so this fails if the sketch bar covers it.
  await toast.hover({ timeout: 1_500 });
  const bar = await box(page.locator('[data-test="sketch-tool-options"]'));
  const shown = await box(toast);
  expect(shown.y + shown.height).toBeLessThanOrEqual(bar.y);
  const colors = await toast.evaluate((element) => ({
    background: getComputedStyle(element).backgroundColor,
    text: getComputedStyle(element).color,
  }));
  expect(colors).toEqual({ background: "rgb(255, 255, 255)", text: "rgb(36, 36, 36)" });

  // It is the only sign the clipboard changed, so it outlasts the usual two seconds. (A toast waits while it is hovered.)
  await page.mouse.move(0, 0);
  await page.waitForTimeout(2_200);
  await expect(toast).toBeVisible();
  await expect(toast).toHaveCount(0, { timeout: 5_000 });
});

test("a copy kept from earlier is already tucked in when the bar opens, instead of popping", async ({ page }) => {
  const middle = await openSketch(page);
  await grantClipboard(page);
  await copyTextSketch(page, { x: middle.x - 100, y: middle.y }, "Already kept");
  const recent = page.locator('[data-test="sketch-recent"]');
  await expect(recent).toBeVisible({ timeout: 10_000 });

  await page.locator('[data-test="canvas-tool-design"]').click();
  await expect(page.locator('[data-test="sketch-tool-options"]')).toHaveCount(0);
  await page.locator('[data-test="canvas-tool-sketch"]').click();

  // The sketch is there with the bar and does not scale in on its own.
  await expect(recent).toHaveCount(1);
  await expect(recent).not.toHaveAttribute("data-enter", "true");
  await expect(page.locator('[data-test="sketch-tool-options"]')).toHaveAttribute("data-settled", "true");
  await expect(recent).not.toHaveAttribute("data-enter", "true");
});
