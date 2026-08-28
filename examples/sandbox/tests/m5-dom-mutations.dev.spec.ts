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
  await page.goto("/playground");
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
  await page.goto("/playground");
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
  await page.goto("/playground");
  const heading = page.locator("#hero-title");
  await heading.click();
  await page.keyboard.press("Backspace");

  await expect(heading).not.toBeAttached();
  await page.locator('[data-test="changes-toggle"]').click();
  await expect(page.locator('[data-test="dom-change-row"][data-action="delete"]')).toBeVisible();
});

test("dev: Inspect revert and undo/redo operate on canonical structural history", async ({ page }) => {
  await page.goto("/playground");
  const repeated = page.getByText("Repeated 3", { exact: true });
  await repeated.click();
  await page.keyboard.press("Backspace");
  await expect(repeated).not.toBeAttached();

  await page.locator('[data-test="changes-toggle"]').click();
  await expect(page.locator('[data-test="structural-source-site"]')).toContainText("RepeatedItem");
  await expect(page.locator('[data-test="structural-scope"]')).toHaveText("This rendered item only");
  await page.locator('[data-test="dom-change-revert"]').click();
  await expect(page.getByText("Repeated 3", { exact: true })).toBeVisible();

  await repeated.click();
  await page.keyboard.press("Backspace");
  await expect(repeated).not.toBeAttached();
  await page.keyboard.press("Control+z");
  await expect(page.getByText("Repeated 3", { exact: true })).toBeVisible();
  await page.keyboard.press("Control+Shift+z");
  await expect(page.getByText("Repeated 3", { exact: true })).not.toBeAttached();
});

test("dev: Canvas revert and undo/redo are controller-owned and the card reload keeps the current history", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="mode-canvas"]').click();
  const frame = page.frameLocator(".canvas-card__iframe").first();
  const repeated = frame.getByText("Repeated 3", { exact: true });
  await repeated.click();
  await repeated.press("Backspace");
  await expect(repeated).not.toBeAttached();

  await frame.locator("body").press("Control+z");
  await expect(frame.getByText("Repeated 3", { exact: true })).toBeVisible();
  await frame.locator("body").press("Control+Shift+z");
  await expect(frame.getByText("Repeated 3", { exact: true })).not.toBeAttached();

  await page.locator('[data-test="changes-toggle"]').click();
  await page.locator('[data-test="dom-change-revert"]').click();
  await expect(frame.getByText("Repeated 3", { exact: true })).toBeVisible();
  await page.locator('[data-test^="canvas-card-reload-"]').click();
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible({ timeout: 20000 });
  await expect(frame.getByText("Repeated 3", { exact: true })).toBeVisible();
});

test("dev: an application replacement is reported as overridden and is not reapplied", async ({ page }) => {
  await page.goto("/playground");
  const repeated = page.getByText("Repeated 3", { exact: true });
  await repeated.click();
  await page.keyboard.press("Backspace");
  await expect(repeated).not.toBeAttached();

  await page.evaluate(() => {
    const list = document.querySelector('[data-test="repeated-items"]');
    const placeholder = Array.from(list?.childNodes ?? []).find((node) =>
      node.nodeType === Node.COMMENT_NODE && node.nodeValue === "nudge-ui-deleted");
    if (!placeholder) throw new Error("Expected structural projection placeholder");
    const replacement = document.createElement("div");
    replacement.className = "repeated-item";
    replacement.dataset.applicationRendered = "true";
    replacement.textContent = "Application replacement";
    placeholder.replaceWith(replacement);
  });

  await page.locator('[data-test="changes-toggle"]').click();
  await expect(page.locator('[data-test="structural-diagnostic"][data-document="Inspect"][data-status="overridden"]')).toBeVisible();
  await expect(page.locator('[data-application-rendered="true"]')).toHaveText("Application replacement");
  await page.waitForTimeout(100);
  await expect(page.locator('[data-application-rendered="true"]')).toHaveText("Application replacement");
});

test("dev: Inspect DOM moves survive switching to Canvas", async ({ page }) => {
  await page.goto("/playground");
  await dragBefore(
    page,
    page.locator('[data-test="flex-child-a"]'),
    page.locator('[data-test="flex-child-c"]'),
    page.locator('[data-test="dom-drop-line"]'),
    page.locator('[data-test="dom-drop-target"]'),
  );

  await expect.poll(() => page.locator('[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");
  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await expect.poll(() => frame.locator('[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");
});

test("dev: Inspect arrow keys reorder a selected sibling", async ({ page }) => {
  await page.goto("/playground");
  const first = page.locator('[data-test="flex-child-a"]');
  await first.click();
  const outline = page.locator('[data-test="selected-outline"]');
  await expect(outline).toBeVisible();
  const before = await outline.boundingBox();
  await page.keyboard.press("ArrowDown");

  await expect.poll(() => page.locator('[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");
  await expect.poll(async () => (await outline.boundingBox())?.x ?? 0).toBeGreaterThan(before?.x ?? 0);

  await page.locator('[data-test="mode-canvas"]').click();
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await expect.poll(() => frame.locator('[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");
});

test("dev: Inspect selected outline follows a position-only flex-column nudge", async ({ page }) => {
  await page.goto("/playground");
  const selected = page.getByText("Repeated 1", { exact: true });
  const outline = page.locator('[data-test="selected-outline"]');
  await selected.scrollIntoViewIfNeeded();
  await selected.click();
  await page.mouse.move(0, 0);
  await expect(outline).toBeVisible();

  const before = await Promise.all([selected.boundingBox(), outline.boundingBox()]);
  await page.keyboard.press("ArrowDown");

  await expect(page.locator('[data-test="repeated-items"] .repeated-item')).toHaveText([
    "Repeated 2", "Repeated 1", "Repeated 3", "Repeated 4", "Repeated 5", "Repeated 6",
  ]);
  await expect.poll(async () => {
    const [selectedBox, outlineBox] = await Promise.all([selected.boundingBox(), outline.boundingBox()]);
    return Boolean(selectedBox && outlineBox
      && Math.abs(selectedBox.y - outlineBox.y) < 1
      && Math.abs(selectedBox.height - outlineBox.height) < 1);
  }).toBe(true);
  const after = await Promise.all([selected.boundingBox(), outline.boundingBox()]);
  expect(after[0]?.y).toBeGreaterThan(before[0]?.y ?? 0);
  expect(after[1]?.y).toBeGreaterThan(before[1]?.y ?? 0);
});

test("dev: Canvas drags a tracked element through the controller with an insertion guide", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="mode-canvas"]').click();
  const frame = page.frameLocator(".canvas-card__iframe").first();
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
  await expect(page.locator('[data-test="structural-diagnostic"][data-document^="Canvas "][data-status="applied"]')).toBeVisible();
  await expect(page.locator('[data-test="structural-diagnostic"][data-document^="Canvas "][data-status="missing"]')).toHaveCount(0);

  await page.locator('[data-test^="canvas-card-preview-"]').first().click();
  await expect.poll(() => page.locator('[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");
});

test("dev: Canvas selected outline follows a position-only flex-column nudge", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="mode-canvas"]').click();
  const frame = page.frameLocator(".canvas-card__iframe").first();
  const source = frame.getByText("Repeated 1", { exact: true });
  const outline = page.locator('[data-test="canvas-selected-outline"]');

  await source.scrollIntoViewIfNeeded();
  await page.mouse.move(0, 0);
  await source.click();
  await expect(outline).toBeVisible();
  const before = await Promise.all([source.boundingBox(), outline.boundingBox()]);
  await frame.locator("body").press("ArrowDown");

  await expect(frame.locator('[data-test="repeated-items"] .repeated-item')).toHaveText([
    "Repeated 2", "Repeated 1", "Repeated 3", "Repeated 4", "Repeated 5", "Repeated 6",
  ]);
  await expect.poll(async () => {
    const [sourceBox, outlineBox] = await Promise.all([source.boundingBox(), outline.boundingBox()]);
    return Boolean(sourceBox && outlineBox
      && sourceBox.y > (before[0]?.y ?? sourceBox.y)
      && outlineBox.y > (before[1]?.y ?? outlineBox.y)
      && Math.abs((sourceBox.y - (before[0]?.y ?? 0)) - (outlineBox.y - (before[1]?.y ?? 0))) < 1);
  }).toBe(true);
});

test("dev: Canvas centres a flex-row insertion guide in a space-between gap", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="mode-canvas"]').click();
  const frame = page.frameLocator(".canvas-card__iframe").first();
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
  await page.goto("/playground");
  await page.locator('[data-test="mode-canvas"]').click();
  const frame = page.frameLocator(".canvas-card__iframe").first();
  const heading = frame.locator("#hero-title");
  await expect(heading).toBeVisible();
  await heading.click();
  await heading.press("Backspace");

  await expect(heading).not.toBeAttached();
  await page.locator('[data-test="changes-toggle"]').click();
  await expect(page.locator('[data-test="dom-change-row"][data-action="delete"]')).toBeVisible();
  await expect(page.locator('[data-test="structural-diagnostic"][data-document^="Canvas "][data-status="applied"]')).toBeVisible();
  await expect(page.locator('[data-test="structural-diagnostic"][data-document^="Canvas "][data-status="missing"]')).toHaveCount(0);
});

test("dev: Inspect deletes one repeated item in Canvas and a reloaded card receives the delete", async ({ page }) => {
  await page.goto("/playground");
  const repeated = page.getByText("Repeated 3", { exact: true });
  await repeated.click();
  await page.keyboard.press("Backspace");
  await expect(repeated).not.toBeAttached();
  await expect(page.locator(".repeated-item")).toHaveText([
    "Repeated 1", "Repeated 2", "Repeated 4", "Repeated 5", "Repeated 6",
  ]);

  await page.locator('[data-test="mode-canvas"]').click();
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await expect(frame.locator(".repeated-item")).toHaveText([
    "Repeated 1", "Repeated 2", "Repeated 4", "Repeated 5", "Repeated 6",
  ]);

  await page.locator('[data-test^="canvas-card-reload-"]').click();
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible({ timeout: 20000 });
  await expect(frame.locator(".repeated-item")).toHaveText([
    "Repeated 1", "Repeated 2", "Repeated 4", "Repeated 5", "Repeated 6",
  ]);
});

test("dev: Canvas deletes one repeated item and the identical host target disappears", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="mode-canvas"]').click();
  const frame = page.frameLocator(".canvas-card__iframe").first();
  const repeated = frame.getByText("Repeated 3", { exact: true });
  await expect(repeated).toBeVisible();
  await repeated.click();
  await repeated.press("Backspace");
  await expect(repeated).not.toBeAttached();
  await expect(frame.locator(".repeated-item")).toHaveText([
    "Repeated 1", "Repeated 2", "Repeated 4", "Repeated 5", "Repeated 6",
  ]);

  await page.locator('[data-test^="canvas-card-preview-"]').first().click();
  await expect(page.locator('[data-test="canvas-workspace"]')).not.toBeVisible();
  await expect(page.locator(".repeated-item")).toHaveText([
    "Repeated 1", "Repeated 2", "Repeated 4", "Repeated 5", "Repeated 6",
  ]);
});

test("dev: Canvas delete-only projection advances into every already-ready card", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible({ timeout: 20000 });
  await page.locator('[data-test^="canvas-card-duplicate-"]').click();
  await expect(page.locator(".canvas-card__iframe")).toHaveCount(2);
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible({ timeout: 20000 });

  const first = page.frameLocator(".canvas-card__iframe").nth(0);
  const second = page.frameLocator(".canvas-card__iframe").nth(1);
  const repeated = first.getByText("Repeated 3", { exact: true });
  await repeated.click();
  await repeated.press("Backspace");

  await expect(second.locator(".repeated-item")).toHaveText([
    "Repeated 1", "Repeated 2", "Repeated 4", "Repeated 5", "Repeated 6",
  ]);
});

test("dev: Canvas arrow keys reorder a selected flex-row sibling", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="mode-canvas"]').click();
  const frame = page.frameLocator(".canvas-card__iframe").first();
  const first = frame.locator('[data-test="flex-child-a"]');
  await first.click();
  await first.press("ArrowRight");

  await expect.poll(() => frame.locator('[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");

  await page.locator('[data-test^="canvas-card-preview-"]').first().click();
  await expect.poll(() => page.locator('[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");
});

test("dev: a Canvas reload receives the current sibling reorder snapshot", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="mode-canvas"]').click();
  const frame = page.frameLocator(".canvas-card__iframe").first();
  const first = frame.locator('[data-test="flex-child-a"]');
  await first.click();
  await first.press("ArrowRight");
  await expect.poll(() => frame.locator('[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");

  await page.locator('[data-test^="canvas-card-reload-"]').click();
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible({ timeout: 20000 });
  await expect.poll(() => frame.locator('[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");
});

test("dev: reordering one repeated rendered sibling leaves every other instance intact", async ({ page }) => {
  await page.goto("/playground");
  const selected = page.getByText("Repeated 3", { exact: true });
  await selected.click();
  await page.keyboard.press("ArrowDown");

  const expectedOrder = ["Repeated 1", "Repeated 2", "Repeated 4", "Repeated 3", "Repeated 5", "Repeated 6"];
  await expect(page.locator(".repeated-item")).toHaveText(expectedOrder);
  await page.locator('[data-test="mode-canvas"]').click();
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await expect(frame.locator(".repeated-item")).toHaveText(expectedOrder);
});
