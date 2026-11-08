import { clickFrameAction, showCanvas, waitForCanvasTransition } from "./canvasTransition.ts";
import { expect, test } from "@playwright/test";
import { PAN_WHEEL_SPEED } from "../../../packages/nudge-ui/src/inspector/canvas/wheelPan.ts";

test("scrolling pans the canvas and Use app normally restores nested iframe scrolling", async ({ page }) => {
  await page.goto("/playground");
  await showCanvas(page);
  await waitForCanvasTransition(page);
  const iframe = page.locator(".canvas-card__iframe").first();
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).toHaveCount(0);
  await iframe.contentFrame().locator("body").evaluate((body) => {
    const scroller = body.ownerDocument.createElement("div");
    scroller.id = "wheel-pan-fixture";
    scroller.style.cssText = "position:fixed;left:80px;top:80px;width:300px;height:200px;overflow:auto;background:white;z-index:1000;";
    scroller.innerHTML = '<div style="width:1000px;height:1000px">Scrollable app content</div>';
    body.append(scroller);
  });
  const scroller = iframe.contentFrame().locator("#wheel-pan-fixture");
  const content = page.locator('[data-test="canvas-board-content"]');
  const camera = () => content.evaluate((element) => {
    const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
    return { x: matrix.e, y: matrix.f, zoom: matrix.a };
  });
  const before = await camera();
  await scroller.hover();
  await page.mouse.wheel(50, 80);
  await expect.poll(camera).toEqual({ x: before.x - 50 * PAN_WHEEL_SPEED, y: before.y - 80 * PAN_WHEEL_SPEED, zoom: before.zoom });
  expect(await scroller.evaluate((element) => ({ x: element.scrollLeft, y: element.scrollTop }))).toEqual({ x: 0, y: 0 });

  const board = page.locator('[data-test="canvas-board"]');
  await board.dispatchEvent("wheel", { deltaX: 20, deltaY: 30, bubbles: true, composed: true });
  await expect.poll(camera).toEqual({ x: before.x - 70 * PAN_WHEEL_SPEED, y: before.y - 110 * PAN_WHEEL_SPEED, zoom: before.zoom });
  const panned = await camera();
  // The board owns a wheel gesture until it settles, then frames take the pointer back.
  await expect.poll(() => iframe.evaluate((element) => getComputedStyle(element.closest(".canvas-card")!).pointerEvents)).toBe("auto");
  await page.getByRole("button", { name: "Use app normally", exact: true }).click();
  await scroller.hover();
  await page.mouse.wheel(50, 80);
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect.poll(() => scroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(await camera()).toEqual(panned);
});

test("a wheel pan keeps frames out of the gesture until it settles", async ({ page }) => {
  await page.goto("/playground");
  await showCanvas(page);
  await waitForCanvasTransition(page);
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).toHaveCount(0);
  const card = page.locator(".canvas-card").first();
  const pointerEvents = () => card.evaluate((element) => getComputedStyle(element).pointerEvents);
  const box = await card.boundingBox();
  if (!box) throw new Error("frame did not render");

  // Trackpad momentum picks a new target when it starts, so a frame that slid under the pointer must not take it.
  await page.mouse.move(box.x + box.width + 40, box.y + box.height / 2);
  await page.mouse.wheel(-120, 0);
  expect(await pointerEvents()).toBe("none");
  await expect.poll(pointerEvents).toBe("auto");
});

test("Holding A temporarily enables app interaction across iframe focus and the icon pins it", async ({ page }) => {
  await page.goto("/playground");
  await showCanvas(page);
  await waitForCanvasTransition(page);
  const normal = page.getByRole("button", { name: "Use app normally", exact: true });
  const pan = page.getByRole("button", { name: "Pan", exact: true });
  const iframe = page.locator(".canvas-card__iframe").first();
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).toHaveCount(0);
  await iframe.contentFrame().locator("body").evaluate((body) => {
    const button = body.ownerDocument.createElement("button");
    button.id = "app-interaction-button";
    button.textContent = "App action";
    button.style.cssText = "position:fixed;left:80px;top:80px;width:200px;height:80px;z-index:1000;";
    button.dataset.clicks = "0";
    button.onclick = () => { button.dataset.clicks = String(Number(button.dataset.clicks) + 1); };
    body.append(button);
    const input = body.ownerDocument.createElement("input");
    input.id = "app-interaction-input";
    body.append(input);
  });
  const action = iframe.contentFrame().locator("#app-interaction-button");
  await page.keyboard.press("i");
  await expect(normal).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.down("Shift");
  await expect(normal).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.up("Shift");
  await page.keyboard.down("A");
  await expect(normal).toHaveAttribute("aria-pressed", "true");
  await action.click();
  await expect(action).toHaveAttribute("data-clicks", "1");
  await page.keyboard.up("A");
  await expect(normal).toHaveAttribute("aria-pressed", "false");
  await action.click();
  await expect(action).toHaveAttribute("data-clicks", "1");

  // A starts inside the iframe this time; release must still reach the controller.
  await page.keyboard.down("A");
  await expect(normal).toHaveAttribute("aria-pressed", "true");
  await normal.click();
  await page.keyboard.up("A");
  await expect(normal).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.down("A");
  await page.keyboard.up("A");
  await expect(normal).toHaveAttribute("aria-pressed", "true");
  await normal.click();
  await expect(normal).toHaveAttribute("aria-pressed", "false");

  await pan.click();
  await page.keyboard.down("A");
  await expect(normal).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.up("A");
  await expect(pan).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await iframe.contentFrame().locator("#app-interaction-input").focus();
  await page.keyboard.down("A");
  await expect(normal).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.up("A");
});

test("Holding A clicks links inside the frame without opening a browser tab", async ({ page, context }) => {
  await page.goto("/playground");
  await showCanvas(page);
  await waitForCanvasTransition(page);
  const iframe = page.locator(".canvas-card__iframe").first();
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).toHaveCount(0);
  await iframe.contentFrame().locator("body").evaluate((body) => {
    const link = body.ownerDocument.createElement("a");
    link.id = "app-interaction-link";
    link.href = "/#app-interaction-destination";
    link.textContent = "App link";
    link.style.cssText = "position:fixed;left:80px;top:80px;width:200px;height:80px;background:white;z-index:1000;";
    body.append(link);
  });
  const initialPages = context.pages().length;
  await page.keyboard.down("A");
  await expect(page.getByRole("button", { name: "Use app normally", exact: true })).toHaveAttribute("aria-pressed", "true");
  await iframe.contentFrame().locator("#app-interaction-link").click();
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await expect(page.locator(".canvas-card__iframe")).toHaveCount(1);
  await expect.poll(() => frame.locator("body").evaluate(() => location.pathname + location.hash)).toBe("/#app-interaction-destination");
  await page.keyboard.up("A");
  expect(context.pages()).toHaveLength(initialPages);
});

test("Canvas stops horizontal overscroll from navigating back and restores the page root on leaving", async ({ page }) => {
  await page.goto("/playground");
  const overscroll = (element: Element) => getComputedStyle(element).overscrollBehaviorX;
  const root = page.locator("html");
  await expect.poll(() => root.evaluate(overscroll)).toBe("auto");

  await showCanvas(page);
  await waitForCanvasTransition(page);
  await expect.poll(() => root.evaluate(overscroll)).toBe("none");
  const iframe = page.locator(".canvas-card__iframe").first();
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).toHaveCount(0);
  await expect.poll(() => iframe.contentFrame().locator("html").evaluate(overscroll)).toBe("none");

  await clickFrameAction(page, page.locator('[data-test^="canvas-card-focus-"]').first());
  await expect.poll(() => root.evaluate(overscroll)).toBe("auto");
});
