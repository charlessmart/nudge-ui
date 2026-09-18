import { test, expect } from "@playwright/test";

test.describe("Canvas spatial board", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/playground");
      await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  });

  test("dev: board has spatial transform with board-content child", async ({ page }) => {
    const boardContent = page.locator('[data-test="canvas-board-content"]');
    await expect(boardContent).toBeAttached();

    const hasTransform = await boardContent.evaluate((el: HTMLElement) => {
      const t = getComputedStyle(el).transform;
      return t !== "none";
    });
    // After the initial canvas fit, the board content should have a transform
    // (scale may be 1, but translate may be present if content doesn't fill viewport)
    const transformValue = await boardContent.evaluate((el: HTMLElement) => {
      return el.style.transform;
    });
    expect(transformValue).toBeTruthy();
  });

  test("dev: cards use absolute positioning with world coordinates", async ({ page }) => {
    const cards = page.locator(".canvas-card");
    await expect(cards).toHaveCount(1);

    const position = await cards.first().evaluate((el: HTMLElement) => {
      const s = el.style;
      return {
        position: s.position || getComputedStyle(el).position,
        left: s.left,
        top: s.top,
      };
    });
    expect(position.position).toBe("absolute");
    expect(position.left).toBeTruthy();
    expect(position.top).toBeTruthy();
  });

  test("dev: Fit All control is removed from the canvas view", async ({ page }) => {
    await expect(page.locator('[data-test="canvas-fit-all"]')).toHaveCount(0);
  });

  test("dev: card resize handle is present and appears on hover", async ({ page }) => {
    const card = page.locator(".canvas-card").first();
    const resizeHandle = card.locator('[data-test^="canvas-card-resize-"]');
    await expect(resizeHandle).toBeAttached();

    const opacityDefault = await resizeHandle.evaluate((el: HTMLElement) =>
      getComputedStyle(el).opacity,
    );
    expect(Number(opacityDefault)).toBeLessThanOrEqual(0.1);

    await card.hover();
    await expect.poll(async () => Number(await resizeHandle.evaluate((el: HTMLElement) =>
      getComputedStyle(el).opacity,
    ))).toBeGreaterThan(0.1);
  });

  test("dev: card iframe receives actual width/height from card dimensions", async ({ page }) => {
    const iframe = page.locator(".canvas-card__iframe").first();

    const iframeStyles = await iframe.evaluate((el: HTMLElement) => {
      const s = getComputedStyle(el);
      return { width: s.width, height: s.height };
    });

    expect(Number.parseFloat(iframeStyles.width)).toBeGreaterThan(0);
    expect(Number.parseFloat(iframeStyles.height)).toBeGreaterThan(0);
  });

});

test.describe("Canvas spatial board — two responsive sizes", () => {
  test("dev: resize a card to a smaller viewport triggers different iframe dimensions", async ({ page }) => {
    await page.goto("/playground");
      await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

    const card = page.locator(".canvas-card").first();
    const iframe = card.locator(".canvas-card__iframe").first();

    const sizeBefore = await iframe.boundingBox();
    expect(sizeBefore).not.toBeNull();

    const resizeHandle = card.locator('[data-test^="canvas-card-resize-"]');
    const handleBox = await resizeHandle.boundingBox();
    expect(handleBox).not.toBeNull();

    const targetX = handleBox!.x - 200;
    const targetY = handleBox!.y - 100;

    await resizeHandle.hover();
    await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(targetX, targetY, { steps: 5 });
    await page.mouse.up();
    await page.waitForTimeout(300);

    const sizeAfter = await iframe.boundingBox();
    expect(sizeAfter).not.toBeNull();

    expect(sizeAfter!.width).toBeLessThan(sizeBefore!.width);
    expect(sizeAfter!.height).toBeLessThan(sizeBefore!.height);

  });
});

test.describe("Canvas board gesture handling", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/playground");
      await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  });

  test("dev: unmodified wheel event does not change board transform", async ({ page }) => {
    const board = page.locator('[data-test="canvas-board"]');
    const boardContent = page.locator('[data-test="canvas-board-content"]');

    const transformBefore = await boardContent.evaluate((el: HTMLElement) => el.style.transform);

    await board.dispatchEvent("wheel", { deltaY: 100 } as unknown as EventInit);
    await page.waitForTimeout(200);

    const transformAfter = await boardContent.evaluate((el: HTMLElement) => el.style.transform);
    expect(transformAfter).toBe(transformBefore);
  });

  test("dev: ordinary empty-background drag does not pan the board", async ({ page }) => {
    const boardContent = page.locator('[data-test="canvas-board-content"]');
    const transformBefore = await boardContent.evaluate((el: HTMLElement) => el.style.transform);

    const board = page.locator('[data-test="canvas-board"]');
    const boardBox = await board.boundingBox();
    expect(boardBox).not.toBeNull();

    await page.mouse.move(boardBox!.x + boardBox!.width / 2, boardBox!.y + boardBox!.height / 2);
    await page.mouse.down();
    await page.mouse.move(boardBox!.x + boardBox!.width / 2 + 100, boardBox!.y + boardBox!.height / 2 + 50, { steps: 3 });
    await page.mouse.up();
    await page.waitForTimeout(200);

    const transformAfter = await boardContent.evaluate((el: HTMLElement) => el.style.transform);
    expect(transformAfter).toBe(transformBefore);
  });

  test("dev: ordinary iframe clicks select without triggering the application", async ({ page }) => {
    const frame = page.frameLocator(".canvas-card__iframe").first();
    const button = frame.locator("button.btn").first();
    await expect(button).toBeVisible({ timeout: 10000 });
    await button.click();
    await expect(page.locator('[data-test="canvas-selected-outline"]')).toBeVisible();
    await expect(frame.locator('[data-test="click-counter"]')).toContainText("clicks: 0");
  });

  test("dev: Space-drag inside an iframe pans the board", async ({ page }) => {
    const boardContent = page.locator('[data-test="canvas-board-content"]');
    const transformBefore = await boardContent.evaluate((el: HTMLElement) => el.style.transform);
    const iframe = page.locator(".canvas-card__iframe").first();
    await expect(iframe).toBeVisible();
    await expect(page.locator('[data-test^="canvas-card-loading-"]')).toHaveCount(0, { timeout: 10000 });
    const box = await iframe.boundingBox();
    expect(box).not.toBeNull();

    // Focus the document inside the card so Space is handled by the renderer.
    await page.frameLocator(".canvas-card__iframe").first().locator("body").click({
      position: { x: 40, y: 40 },
    });
    await page.keyboard.down("Space");
    await page.mouse.move(box!.x + 80, box!.y + 80);
    await page.mouse.down();
    await page.mouse.move(box!.x + 180, box!.y + 130, { steps: 3 });
    await page.mouse.up();
    await page.keyboard.up("Space");

    await expect.poll(() => boardContent.evaluate((el: HTMLElement) => el.style.transform))
      .not.toBe(transformBefore);
  });

  test("dev: Space-drag can enter an iframe after Space is pressed on the canvas", async ({ page }) => {
    const board = page.locator('[data-test="canvas-board"]');
    const boardContent = page.locator('[data-test="canvas-board-content"]');
    const transformBefore = await boardContent.evaluate((el: HTMLElement) => el.style.transform);
    const iframe = page.locator(".canvas-card__iframe").first();
    await expect(page.locator('[data-test^="canvas-card-loading-"]')).toHaveCount(0, { timeout: 10000 });
    const box = await iframe.boundingBox();
    expect(box).not.toBeNull();

    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.down("Space");
    await expect(board).toHaveClass(/is-grabbable/);
    await page.mouse.move(box!.x + 80, box!.y + 80);
    await page.mouse.down();
    await page.mouse.move(box!.x + 180, box!.y + 130, { steps: 3 });
    await page.mouse.up();
    await page.keyboard.up("Space");

    await expect.poll(() => boardContent.evaluate((el: HTMLElement) => el.style.transform))
      .not.toBe(transformBefore);
  });

  for (const modifier of ["Meta", "Control"] as const) {
    test(`dev: ${modifier}-wheel over an iframe zooms the board around the pointer`, async ({ page }) => {
      const boardContent = page.locator('[data-test="canvas-board-content"]');
      const transformBefore = await boardContent.evaluate((el: HTMLElement) => el.style.transform);
      const iframe = page.locator(".canvas-card__iframe").first();
      await expect(page.locator('[data-test^="canvas-card-loading-"]')).toHaveCount(0, { timeout: 10000 });
      const box = await iframe.boundingBox();
      expect(box).not.toBeNull();

      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await page.keyboard.down(modifier);
      await page.mouse.wheel(0, -100);
      await page.keyboard.up(modifier);

      await expect.poll(() => boardContent.evaluate((el: HTMLElement) => el.style.transform))
        .not.toBe(transformBefore);
    });
  }
});

test.describe("Canvas board — iframe content remains interactive", () => {
});
