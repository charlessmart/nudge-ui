import { expect, test } from "@playwright/test";

test("scrolling pans the canvas and Use app normally restores nested iframe scrolling", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="canvas-show-canvas"]').click();
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
  await expect.poll(camera).toEqual({ x: before.x - 50, y: before.y - 80, zoom: before.zoom });
  expect(await scroller.evaluate((element) => ({ x: element.scrollLeft, y: element.scrollTop }))).toEqual({ x: 0, y: 0 });

  const board = page.locator('[data-test="canvas-board"]');
  await board.dispatchEvent("wheel", { deltaX: 20, deltaY: 30, bubbles: true, composed: true });
  await expect.poll(camera).toEqual({ x: before.x - 70, y: before.y - 110, zoom: before.zoom });
  const panned = await camera();
  await page.getByRole("button", { name: "Use app normally", exact: true }).click();
  await scroller.hover();
  await page.mouse.wheel(50, 80);
  await expect.poll(() => scroller.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await expect.poll(() => scroller.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
  expect(await camera()).toEqual(panned);
});

test("Shift temporarily enables app interaction across iframe focus and the icon pins it", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="canvas-show-canvas"]').click();
  const normal = page.getByRole("button", { name: "Use app normally", exact: true });
  const pan = page.getByRole("button", { name: "Pan", exact: true });
  const iframe = page.locator(".canvas-card__iframe").first();
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).toHaveCount(0);
  await iframe.contentFrame().locator("body").evaluate((body) => {
    const button = body.ownerDocument.createElement("button");
    button.id = "shift-app-button";
    button.textContent = "App action";
    button.style.cssText = "position:fixed;left:80px;top:80px;width:200px;height:80px;z-index:1000;";
    button.dataset.clicks = "0";
    button.onclick = () => { button.dataset.clicks = String(Number(button.dataset.clicks) + 1); };
    body.append(button);
    const input = body.ownerDocument.createElement("input");
    input.id = "shift-app-input";
    body.append(input);
  });
  const action = iframe.contentFrame().locator("#shift-app-button");
  await page.keyboard.press("i");
  await expect(normal).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.down("Shift");
  await expect(normal).toHaveAttribute("aria-pressed", "true");
  await action.click();
  await expect(action).toHaveAttribute("data-clicks", "1");
  await page.keyboard.up("Shift");
  await expect(normal).toHaveAttribute("aria-pressed", "false");
  await action.click();
  await expect(action).toHaveAttribute("data-clicks", "1");

  // Shift starts inside the iframe this time; release must reach the controller
  // even though inspector interactions were suspended by its keydown.
  await page.keyboard.down("Shift");
  await expect(normal).toHaveAttribute("aria-pressed", "true");
  await normal.click();
  await page.keyboard.up("Shift");
  await expect(normal).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.down("Shift");
  await page.keyboard.up("Shift");
  await expect(normal).toHaveAttribute("aria-pressed", "true");
  await normal.click();
  await expect(normal).toHaveAttribute("aria-pressed", "false");

  await pan.click();
  await page.keyboard.down("Shift");
  await expect(normal).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.up("Shift");
  await expect(pan).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await iframe.contentFrame().locator("#shift-app-input").focus();
  await page.keyboard.down("Shift");
  await expect(normal).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.up("Shift");
});
