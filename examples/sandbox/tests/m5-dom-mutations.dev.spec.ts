import { expect, test } from "@playwright/test";

async function dragBefore(
  page: import("@playwright/test").Page,
  source: import("@playwright/test").Locator,
  destination: import("@playwright/test").Locator,
  dropLine: import("@playwright/test").Locator,
  dropTarget?: import("@playwright/test").Locator,
): Promise<void> {
  await source.scrollIntoViewIfNeeded();
  await destination.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const destinationBox = await destination.boundingBox();
  if (!sourceBox || !destinationBox) throw new Error("Expected visible drag targets");
  const isFlexRow = await destination.evaluate((element) => {
    const parent = element.parentElement;
    if (!parent) return false;
    const style = getComputedStyle(parent);
    return (style.display === "flex" || style.display === "inline-flex") && style.flexDirection.startsWith("row");
  });
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    isFlexRow ? destinationBox.x + 4 : destinationBox.x + destinationBox.width / 2,
    isFlexRow ? destinationBox.y + destinationBox.height / 2 : destinationBox.y + 4,
    { steps: 3 },
  );
  await expect(dropLine).toBeVisible();
  const dropLineBox = await dropLine.boundingBox();
  if (!dropLineBox) throw new Error("Expected visible drop indicator");
  if (isFlexRow) expect(dropLineBox.height).toBeGreaterThan(dropLineBox.width);
  if (dropTarget) await expect(dropTarget).toBeVisible();
  await page.mouse.up();
}

async function dragIntoFlexGap(
  page: import("@playwright/test").Page,
  source: import("@playwright/test").Locator,
  leftItem: import("@playwright/test").Locator,
  rightItem: import("@playwright/test").Locator,
  dropLine: import("@playwright/test").Locator,
): Promise<void> {
  await source.evaluate((element) => {
    const parent = element.parentElement!;
    parent.style.justifyContent = "space-between";
    Array.from(parent.children).forEach((child) => {
      const item = child as HTMLElement;
      item.style.flex = "0 0 auto";
      item.style.width = "40px";
    });
  });
  await source.scrollIntoViewIfNeeded();
  await rightItem.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250); // The sandbox demo animates flex changes.
  const [sourceBox, leftBox, rightBox] = await Promise.all([
    source.boundingBox(), leftItem.boundingBox(), rightItem.boundingBox(),
  ]);
  if (!sourceBox || !leftBox || !rightBox) throw new Error("Expected visible flex items");
  const gapCentre = (leftBox.x + leftBox.width + rightBox.x) / 2;
  const gapY = leftBox.y + leftBox.height / 2;
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(gapCentre, gapY, { steps: 3 });
  await expect(dropLine).toBeVisible();
  const lineBox = await dropLine.boundingBox();
  if (!lineBox) throw new Error("Expected visible gap indicator");
  expect(Math.abs(lineBox.x + lineBox.width / 2 - gapCentre)).toBeLessThan(6);
  await page.mouse.up();
}

test("dev: Inspect drags a tracked element with an insertion guide and records the DOM move", async ({ page }) => {
  await page.goto("/");
  const source = page.locator('[data-test="flex-child-a"]');
  const destination = page.locator('[data-test="flex-child-c"]');
  expect(await source.getAttribute("data-cid")).toBeTruthy();

  await expect.poll(() => source.evaluate((element) => ({
    cursor: getComputedStyle(element).cursor,
    userSelect: getComputedStyle(element).userSelect,
  }))).toEqual({ cursor: "default", userSelect: "none" });

  await dragBefore(
    page,
    source,
    destination,
    page.locator('[data-test="dom-drop-line"]'),
    page.locator('[data-test="dom-drop-target"]'),
  );

  await expect.poll(() => page.locator('[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");
  await page.locator('[data-test="changes-toggle"]').click();
  await expect(page.locator('[data-test="dom-change-row"][data-action="move"]')).toBeVisible();
});

test("dev: Inspect centres a flex-row insertion guide in a space-between gap", async ({ page }) => {
  await page.goto("/");
  await dragIntoFlexGap(
    page,
    page.locator('[data-test="flex-child-a"]'),
    page.locator('[data-test="flex-child-b"]'),
    page.locator('[data-test="flex-child-c"]'),
    page.locator('[data-test="dom-drop-line"]'),
  );
  await expect.poll(() => page.locator('[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");
});

test("dev: Inspect deletes the selected tracked element with the macOS Backspace key and records the removal", async ({ page }) => {
  await page.goto("/");
  const heading = page.locator("#hero-title");
  await heading.click();
  await page.keyboard.press("Backspace");

  await expect(heading).not.toBeAttached();
  await page.locator('[data-test="changes-toggle"]').click();
  await expect(page.locator('[data-test="dom-change-row"][data-action="delete"]')).toBeVisible();
});

test("dev: Inspect arrow keys reorder a selected sibling", async ({ page }) => {
  await page.goto("/");
  const first = page.locator('[data-test="flex-child-a"]');
  await first.click();
  const outline = page.locator('[data-test="selected-outline"]');
  await expect(outline).toBeVisible();
  const before = await outline.boundingBox();
  await page.keyboard.press("ArrowDown");

  await expect.poll(() => page.locator('[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");
  await expect.poll(async () => (await outline.boundingBox())?.x ?? 0).toBeGreaterThan(before?.x ?? 0);
});

test("dev: Canvas drags a tracked element through the controller with an insertion guide", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-test="mode-canvas"]').click();
  const frame = page.frameLocator(".dt-canvas-card__iframe").first();
  const source = frame.locator('[data-test="flex-child-a"]');
  const destination = frame.locator('[data-test="flex-child-c"]');
  await expect(source).toBeVisible();

  await dragBefore(
    page,
    source,
    destination,
    page.locator('[data-test="canvas-dom-drop-line"]'),
    page.locator('[data-test="canvas-dom-drop-target"]'),
  );

  await expect.poll(() => frame.locator('[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");
  await page.locator('[data-test="changes-toggle"]').click();
  await expect(page.locator('[data-test="dom-change-row"][data-action="move"]')).toBeVisible();
});

test("dev: Canvas centres a flex-row insertion guide in a space-between gap", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-test="mode-canvas"]').click();
  const frame = page.frameLocator(".dt-canvas-card__iframe").first();
  await dragIntoFlexGap(
    page,
    frame.locator('[data-test="flex-child-a"]'),
    frame.locator('[data-test="flex-child-b"]'),
    frame.locator('[data-test="flex-child-c"]'),
    page.locator('[data-test="canvas-dom-drop-line"]'),
  );
  await expect.poll(() => frame.locator('[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");
});

test("dev: Canvas deletes a selected tracked element through the controller", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-test="mode-canvas"]').click();
  const frame = page.frameLocator(".dt-canvas-card__iframe").first();
  const heading = frame.locator("#hero-title");
  await expect(heading).toBeVisible();
  await heading.click();
  await heading.press("Backspace");

  await expect(heading).not.toBeAttached();
  await page.locator('[data-test="changes-toggle"]').click();
  await expect(page.locator('[data-test="dom-change-row"][data-action="delete"]')).toBeVisible();
});

test("dev: Canvas arrow keys reorder a selected flex-row sibling", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-test="mode-canvas"]').click();
  const frame = page.frameLocator(".dt-canvas-card__iframe").first();
  const first = frame.locator('[data-test="flex-child-a"]');
  await first.click();
  await first.press("ArrowRight");

  await expect.poll(() => frame.locator('[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");
});
