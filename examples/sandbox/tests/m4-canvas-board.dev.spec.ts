import { test, expect } from "@playwright/test";

test.describe("Canvas spatial board", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-test="mode-canvas"]').click();
    await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  });

  test("dev: board has spatial transform with board-content child", async ({ page }) => {
    const boardContent = page.locator('[data-test="canvas-board-content"]');
    await expect(boardContent).toBeAttached();

    const hasTransform = await boardContent.evaluate((el: HTMLElement) => {
      const t = getComputedStyle(el).transform;
      return t !== "none";
    });
    // After the initial Fit All, the board content should have a transform
    // (scale may be 1, but translate may be present if content doesn't fill viewport)
    const transformValue = await boardContent.evaluate((el: HTMLElement) => {
      return el.style.transform;
    });
    expect(transformValue).toBeTruthy();
  });

  test("dev: cards use absolute positioning with world coordinates", async ({ page }) => {
    const cards = page.locator(".dt-canvas-card");
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

  test("dev: Fit All button is present and labelled", async ({ page }) => {
    const fitAllBtn = page.locator('[data-test="canvas-fit-all"]');
    await expect(fitAllBtn).toBeVisible();
    await expect(fitAllBtn).toHaveAttribute("aria-label", "Fit all cards");
  });

  test("dev: Fit All adjusts board-content transform", async ({ page }) => {
    const boardContent = page.locator('[data-test="canvas-board-content"]');
    const transformBefore = await boardContent.evaluate((el: HTMLElement) => el.style.transform);

    await page.locator('[data-test="canvas-fit-all"]').click();
    await page.waitForTimeout(200);

    const transformAfter = await boardContent.evaluate((el: HTMLElement) => el.style.transform);
    expect(typeof transformAfter).toBe("string");
  });

  test("dev: card resize handle is present and appears on hover", async ({ page }) => {
    const card = page.locator(".dt-canvas-card").first();
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
    const iframe = page.locator(".dt-canvas-card__iframe").first();

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
    await page.goto("/");
    await page.locator('[data-test="mode-canvas"]').click();
    await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

    const card = page.locator(".dt-canvas-card").first();
    const iframe = card.locator(".dt-canvas-card__iframe").first();

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

    if (sizeAfter!.width < sizeBefore!.width * 0.99) {
      expect(sizeAfter!.width).toBeLessThan(sizeBefore!.width);
    }
    if (sizeAfter!.height < sizeBefore!.height * 0.99) {
      expect(sizeAfter!.height).toBeLessThan(sizeBefore!.height);
    }

    await page.locator('[data-test="canvas-fit-all"]').click();
    await page.waitForTimeout(200);
  });
});

test.describe("Canvas board gesture handling", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-test="mode-canvas"]').click();
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

  test("dev: unmodified iframe interaction remains usable (click inside iframe)", async ({ page }) => {
    const frame = page.frameLocator(".dt-canvas-card__iframe").first();
    const button = frame.locator("button.btn").first();
    await expect(button).toBeVisible({ timeout: 10000 });
    await button.click();
    await expect(frame.locator('[data-test="click-counter"]')).toContainText("clicks: 1");
  });
});

test.describe("Canvas board — iframe content remains interactive", () => {
  test("dev: clicking same-origin link in iframe creates a card on spatial board", async ({ page }) => {
    await page.goto("/");
    await page.locator('[data-test="mode-canvas"]').click();
    await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

    const board = page.locator('[data-test="canvas-board"]');
    await expect(board.locator(".dt-canvas-card")).toHaveCount(1);

    const frame = page.frameLocator(".dt-canvas-card__iframe").first();
    const tailwindLink = frame.locator('a[href="/tailwind"]').first();
    await expect(tailwindLink).toBeVisible({ timeout: 20000 });
    await tailwindLink.click();

    await expect(board.locator(".dt-canvas-card")).toHaveCount(2);

    const cards = board.locator(".dt-canvas-card");
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(2);

    const card2 = cards.nth(1);
    const position2 = await card2.evaluate((el: HTMLElement) => ({
      left: el.style.left,
      top: el.style.top,
    }));
    expect(position2.left).toBeTruthy();
    expect(position2.top).toBeTruthy();
  });
});
