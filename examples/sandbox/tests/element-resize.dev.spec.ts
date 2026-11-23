import { test, expect, type Locator, type Page } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";
import { getAppFrame, openEditor } from "@nudge-ui/compatibility/playwright";

async function frameScale(page: Page): Promise<number> {
  const frame = await getAppFrame(page);
  const cssWidth = await frame.evaluate(() => document.documentElement.clientWidth);
  const box = await page.locator("iframe").first().boundingBox();
  return box && cssWidth > 0 ? box.width / cssWidth : 1;
}

async function buttonSize(page: Page): Promise<{ width: number; height: number }> {
  return (await getAppFrame(page)).getByRole("button", { name: "Save" }).evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
}

function handle(page: Page, name: "right" | "bottom" | "bottom-right"): Locator {
  return page.locator(`[data-test="selection-resize-handle"][data-handle="${name}"]`);
}

async function centreOf(locator: Locator): Promise<{ x: number; y: number }> {
  const box = await locator.boundingBox();
  if (!box) throw new Error("Expected a visible resize handle");
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

async function selectSave(page: Page): Promise<Locator> {
  await openEditor(page, "/playground");
  const frame = await getAppFrame(page);
  const button = frame.getByRole("button", { name: "Save" });
  await button.click();
  await expect(handle(page, "bottom-right")).toHaveCount(1);
  return button;
}

test("dev: dragging the right handle commits the width the page renders, within its max-width", async ({ page }) => {
  const button = await selectSave(page);
  await expect(handle(page, "right")).toHaveCount(1);
  const start = await buttonSize(page);
  const limit = Math.round(start.width + 20);
  // A page rule caps the button, so a drag past the cap commits the capped size rather than the pointer's.
  await button.evaluate((element, maxWidth) => {
    element.setAttribute("data-resize-cap", "");
    const style = element.ownerDocument.createElement("style");
    style.textContent = `[data-resize-cap] { max-width: ${maxWidth}px; }`;
    element.ownerDocument.head.append(style);
  }, limit);
  const scale = await frameScale(page);
  const edge = await centreOf(handle(page, "right"));
  await page.mouse.move(edge.x, edge.y);
  await page.mouse.down();
  await page.mouse.move(edge.x + 20 * scale, edge.y, { steps: 4 });
  await page.mouse.move(edge.x + 40 * scale, edge.y, { steps: 4 });
  await page.mouse.up();

  await expect.poll(async () => Math.round((await buttonSize(page)).width), { timeout: 5000 }).toBe(limit);
  await expect.poll(async () => managedSheetText(page), { timeout: 5000 }).toContain(`width: ${limit}px`);
  // Only the dragged axis changes, and the selection stays on the button.
  expect(Math.round((await buttonSize(page)).height)).toBe(Math.round(start.height));
  await expect(handle(page, "bottom-right")).toHaveCount(1);
});

test("dev: a corner drag moves the right edge with the pointer and keeps the left edge", async ({ page }) => {
  await selectSave(page);

  // Pulling the corner moves the right edge with the pointer while the left edge stays put. (The button is
  // baseline-aligned in its row, so its top shifts as it grows; only its height is asserted on that axis.)
  const frame = await getAppFrame(page);
  const button = frame.getByRole("button", { name: "Save" });
  const before = (await button.boundingBox())!;
  const scale = await frameScale(page);
  const corner = await centreOf(handle(page, "bottom-right"));
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(corner.x + 24 * scale, corner.y + 16 * scale, { steps: 6 });
  await page.mouse.up();
  await expect.poll(async () => {
    const after = (await button.boundingBox())!;
    return [
      Math.round(after.x - before.x),
      Math.round((after.x + after.width - (before.x + before.width)) / scale),
      Math.round((after.height - before.height) / scale),
    ];
  }, { timeout: 5000 }).toEqual([0, 24, 16]);
});

test("dev: pressing a handle without moving keeps the selection and changes nothing", async ({ page }) => {
  await selectSave(page);
  const start = await buttonSize(page);
  const corner = await centreOf(handle(page, "bottom-right"));
  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.up();

  await expect(page.locator('[data-test="canvas-selected-outline"]')).toHaveCount(1);
  await expect(handle(page, "bottom-right")).toHaveCount(1);
  expect(await buttonSize(page)).toEqual(start);
  expect(await managedSheetText(page)).not.toMatch(/width:|height:/);
});

test("dev: a corner drag can be cancelled with Escape", async ({ page }) => {
  const button = await selectSave(page);
  const start = await buttonSize(page);
  const scale = await frameScale(page);
  const corner = await centreOf(handle(page, "bottom-right"));

  await page.mouse.move(corner.x, corner.y);
  await page.mouse.down();
  await page.mouse.move(corner.x + 30 * scale, corner.y + 30 * scale, { steps: 6 });
  await expect.poll(async () => Math.round((await buttonSize(page)).height)).toBe(Math.round(start.height + 30));
  await page.keyboard.press("Escape");
  await page.mouse.up();
  await expect.poll(async () => Math.round((await buttonSize(page)).height)).toBe(Math.round(start.height));
  expect(await managedSheetText(page)).not.toMatch(/width:|height:/);

  // Escape also clears the selection, so the handles return only once the button is selected again.
  await expect(handle(page, "bottom-right")).toHaveCount(0);
  await button.click();
  await expect(handle(page, "bottom-right")).toHaveCount(1);
});

test("dev: a multi-selection and an inline element show no resize handles", async ({ page }) => {
  const button = await selectSave(page);
  const frame = await getAppFrame(page);
  await frame.locator(".mini-button").first().click({ modifiers: ["Shift"] });
  await expect(page.locator('[data-test="canvas-selected-outline"]')).toHaveCount(2);
  await expect(page.locator('[data-test="selection-resize-handle"]')).toHaveCount(0);

  await button.click();
  await expect(handle(page, "bottom-right")).toHaveCount(1);
  // width and height do nothing on a non-replaced inline box.
  const inline = frame.locator(".accent-word").first();
  await inline.evaluate((element) => { (element as HTMLElement).style.display = "inline"; });
  await inline.click();
  await expect(page.locator('[data-test="canvas-selected-outline"]')).toHaveAttribute("data-selected-cid", /./);
  expect(await inline.evaluate((element) => element.getAttribute("data-renderer-id"))).toBeTruthy();
  await expect(page.locator('[data-test="canvas-selected-outline"]')).toHaveCount(1);
  await expect(page.locator('[data-test="selection-resize-handle"]')).toHaveCount(0);
});
