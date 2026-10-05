import { clickFrameAction, waitForCanvasTransition } from "./canvasTransition.ts";
import { test, expect } from "@playwright/test";

test("focus-mode address navigation replaces the current frame", async ({ page }) => {
  await page.goto("/playground");
  const cards = page.locator(".canvas-card");
  await expect(cards).toHaveCount(1);
  const id = await cards.first().getAttribute("data-card-id");
  await expect(cards.first().locator("iframe").contentFrame().locator("h1").first()).toBeVisible();
  await page.goto("/conformance?nudge-ui=editor");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toHaveAttribute("data-card-id", id!);
  await expect.poll(() => cards.first().locator("iframe").contentFrame().locator("body").evaluate(() => location.pathname)).toBe("/conformance");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  await expect(cards).toHaveCount(1);
});

test("independent frames highlight their shared live route after navigation", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  await page.locator('[data-test="canvas-tool-select"]').click();
  const cards = page.locator(".canvas-card");
  await cards.first().locator("iframe").contentFrame().locator('a[href="/conformance"]').first().click();
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(1).locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible();
  for (const card of await cards.all()) {
    await expect(card.locator(".canvas-card__frame")).not.toHaveCSS("outline-color", "rgb(168, 85, 247)");
  }
  const ids = await cards.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-card-id")));

  await clickFrameAction(page, cards.nth(1).locator('[data-test^="canvas-card-focus-"]'));
  await page.goto("/playground?nudge-ui=editor");
  await expect(cards.nth(1).locator("iframe").contentFrame().locator("#hero-title")).toBeVisible();
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  for (const card of await cards.all()) {
    await expect(card.locator(".canvas-card__frame")).toHaveCSS("outline-color", "rgb(168, 85, 247)");
    await expect(card.locator(".canvas-card__frame")).toHaveCSS("outline-width", "2px");
  }
  await expect(page.locator(".canvas-frame-section")).toHaveCount(0);
  expect(await cards.evaluateAll((elements) => elements.map((element) => element.getAttribute("data-card-id")))).toEqual(ids);

  await cards.first().dispatchEvent("pointerdown", { button: 0, pointerId: 1 });
  await expect(cards.first()).toHaveClass(/is-selected/);
  await expect(cards.nth(1).locator(".canvas-card__frame")).toHaveCSS("outline-color", "rgb(168, 85, 247)");
  await clickFrameAction(page, cards.nth(1).locator('[data-test^="canvas-card-focus-"]'));
  await page.goto("/conformance?nudge-ui=editor");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  for (const card of await cards.all()) {
    await expect(card.locator(".canvas-card__frame")).not.toHaveCSS("outline-color", "rgb(168, 85, 247)");
  }
});

test("canvas links open a new route once and return to its existing live frame", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  await waitForCanvasTransition(page);
  await page.locator('[data-test="canvas-tool-select"]').click();
  const cards = page.locator(".canvas-card");
  const originalId = await cards.first().getAttribute("data-card-id");
  await cards.first().locator("iframe").contentFrame().locator('a[href="/conformance"]').first().click();
  await expect(cards).toHaveCount(2);
  const destination = cards.nth(1).locator("iframe").contentFrame();
  await expect(cards.nth(1).locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible();
  await destination.locator('a[href="/examples/raw-css"]').evaluate((link: HTMLAnchorElement) => {
    link.href = "/playground";
    link.textContent = "Return to existing page";
  });
  await destination.getByRole("link", { name: "Return to existing page" }).click();
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toHaveAttribute("data-card-id", originalId!);
  await expect(cards.first()).toHaveClass(/is-selected/);
});

for (const linked of [false, true]) {
  test(`returning from Focus centers the ${linked ? "linked" : "standalone"} frame at 90% zoom`, async ({ page }) => {
    await page.goto("/playground");
    await page.locator('[data-test="canvas-show-canvas"]').click();
    await waitForCanvasTransition(page);
    const cards = page.locator(".canvas-card");
    const content = page.locator('[data-test="canvas-board-content"]');
    if (linked) {
      await clickFrameAction(page, cards.first().locator('[data-test^="canvas-card-duplicate-"]'));
      await expect(cards).toHaveCount(2);
      await waitForCanvasTransition(page);
    }
    const active = linked ? cards.nth(1) : cards.first();
    const id = await active.getAttribute("data-card-id");
    const board = page.locator('[data-test="canvas-board"]');
    await board.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(new WheelEvent("wheel", {
        deltaY: 240, ctrlKey: true, clientX: rect.x + rect.width / 2,
        clientY: rect.y + rect.height / 2, bubbles: true, composed: true,
      }));
      element.dispatchEvent(new WheelEvent("wheel", { deltaX: 60, deltaY: -40, bubbles: true, composed: true }));
    });
    const zoom = () => content.evaluate((element) => new DOMMatrixReadOnly(getComputedStyle(element).transform).a);
    expect(await zoom()).not.toBeCloseTo(0.9);
    await clickFrameAction(page, active.locator('[data-test^="canvas-card-focus-"]'));
    await waitForCanvasTransition(page);
    await page.locator('[data-test="canvas-show-canvas"]').click();
    await waitForCanvasTransition(page);
    expect(await zoom()).toBeCloseTo(0.9);
    const offset = await board.evaluate((element, id) => {
      const viewport = element.getBoundingClientRect();
      const frame = element.querySelector(`[data-card-id="${id}"]`)!.getBoundingClientRect();
      return {
        x: frame.x + frame.width / 2 - (viewport.x + viewport.width / 2),
        y: frame.y + frame.height / 2 - (viewport.y + viewport.height / 2),
      };
    }, id);
    expect(offset.x).toBeCloseTo(0, 1);
    expect(offset.y).toBeCloseTo(0, 1);
    await expect(active).toHaveClass(/is-selected/);
  });
}
