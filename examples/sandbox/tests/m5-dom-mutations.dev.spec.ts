import { expect, test } from "@playwright/test";
import { appLocator, getAppFrame } from "./editor.ts";

async function dragBefore(
  page: import("@playwright/test").Page,
  source: import("@playwright/test").Locator,
  destination: import("@playwright/test").Locator,
  dropLine: import("@playwright/test").Locator,
  dropTarget?: import("@playwright/test").Locator,
  afterTarget = false,
): Promise<void> {
  await expect(page.locator('[data-test="inspect-tab"]')).toBeVisible({ timeout: 10000 });
  await source.scrollIntoViewIfNeeded();
  await destination.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const destinationBox = await destination.boundingBox();
  if (!sourceBox || !destinationBox) throw new Error("Expected visible drag targets");
  const layout = await destination.evaluate((element) => {
    const parent = element.parentElement;
    if (!parent) return { isFlexRow: false, isRowReverse: false };
    const style = getComputedStyle(parent);
    const isFlexRow = (style.display === "flex" || style.display === "inline-flex")
      && style.flexDirection.startsWith("row");
    return { isFlexRow, isRowReverse: isFlexRow && style.flexDirection === "row-reverse" };
  });
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    layout.isFlexRow
      ? (afterTarget === layout.isRowReverse ? destinationBox.x + 4 : destinationBox.x + destinationBox.width - 4)
      : destinationBox.x + destinationBox.width / 2,
    layout.isFlexRow
      ? destinationBox.y + destinationBox.height / 2
      : (afterTarget ? destinationBox.y + destinationBox.height - 4 : destinationBox.y + 4),
    { steps: 3 },
  );
  await expect(dropLine).toBeVisible();
  const dropLineBox = await dropLine.boundingBox();
  if (!dropLineBox) throw new Error("Expected visible drop indicator");
  if (layout.isFlexRow) expect(dropLineBox.height).toBeGreaterThan(dropLineBox.width);
  if (dropTarget) await expect(dropTarget).toBeVisible();
  await page.mouse.up();
}

async function dragIntoContainer(
  page: import("@playwright/test").Page,
  source: import("@playwright/test").Locator,
  destination: import("@playwright/test").Locator,
  dropLine: import("@playwright/test").Locator,
): Promise<void> {
  await expect(page.locator('[data-test="inspect-tab"]')).toBeVisible({ timeout: 10000 });
  await source.scrollIntoViewIfNeeded();
  await destination.scrollIntoViewIfNeeded();
  const [sourceBox, destinationBox] = await Promise.all([source.boundingBox(), destination.boundingBox()]);
  if (!sourceBox || !destinationBox) throw new Error("Expected visible drag targets");
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    destinationBox.x + destinationBox.width / 2,
    destinationBox.y + destinationBox.height / 2,
    { steps: 3 },
  );
  await expect(dropLine).toBeVisible();
  await page.mouse.up();
}

async function dragIntoFlexGap(
  page: import("@playwright/test").Page,
  source: import("@playwright/test").Locator,
  leftItem: import("@playwright/test").Locator,
  rightItem: import("@playwright/test").Locator,
  dropLine: import("@playwright/test").Locator,
): Promise<void> {
  await expect(page.locator('[data-test="inspect-tab"]')).toBeVisible({ timeout: 10000 });
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

test("dev: editing surface drags a tracked element with an insertion guide and records the DOM move", async ({ page }) => {
  await page.goto("/playground");
  const source = appLocator(page, '[data-test="flex-child-a"]');
  const destination = appLocator(page, '[data-test="flex-child-c"]');
  expect(await source.getAttribute("data-cid")).toBeTruthy();

  await expect.poll(() => source.evaluate((element) => ({
    cursor: getComputedStyle(element).cursor,
    userSelect: getComputedStyle(element).userSelect,
  }))).toEqual({ cursor: "default", userSelect: "none" });

  await dragBefore(
    page,
    source,
    destination,
    page.locator('[data-test="canvas-dom-drop-line"]'),
    page.locator('[data-test="canvas-dom-drop-target"]'),
  );

  await expect.poll(() => appLocator(page, '[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");
  await page.locator('[data-test="changes-toggle"]').click();
  await expect(page.locator('[data-test="dom-change-row"][data-action="move"]')).toBeVisible();
});

test("dev: editing surface moves an element across containers, preserves destination inheritance, and reloads it", async ({ page }) => {
  await page.goto("/playground");
  const source = appLocator(page, '[data-test="structural-move-target"]');
  const anchor = appLocator(page, '[data-test="structural-anchor"]');
  const destination = appLocator(page, '[data-test="structural-destination"]');

  await expect(source).toHaveCSS("color", "rgb(67, 56, 202)");
  await dragBefore(page, source, anchor, page.locator('[data-test="canvas-dom-drop-line"]'));
  await expect(source).toHaveCSS("color", "rgb(180, 83, 9)");
  await expect(destination).toContainText("Move this card");

  await page.locator('[data-test="changes-toggle"]').click();
  await expect(page.locator('[data-test="dom-change-row"][data-action="move"]')).toContainText("position");
  await page.reload();
  await expect(appLocator(page, '[data-test="structural-destination"]')).toContainText("Move this card");
  await expect(appLocator(page, '[data-test="structural-move-target"]')).toHaveCSS("color", "rgb(180, 83, 9)");

  await expect(page.locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible({ timeout: 20000 });
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await expect(frame.locator('[data-test="structural-destination"]')).toContainText("Move this card");
  await expect(frame.locator('[data-test="structural-move-target"]')).toHaveCSS("color", "rgb(180, 83, 9)");
  await page.locator('[data-test^="canvas-card-reload-"]').click();
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible({ timeout: 20000 });
  await expect(frame.locator('[data-test="structural-destination"]')).toContainText("Move this card");
});

test("dev: a Canvas-originated cross-container move projects back to editing surface", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible({ timeout: 20000 });
  const frame = page.frameLocator(".canvas-card__iframe").first();
  const source = frame.locator('[data-test="structural-move-target"]');
  const anchor = frame.locator('[data-test="structural-anchor"]');
  await dragBefore(page, source, anchor, page.locator('[data-test="canvas-dom-drop-line"]'));

  await expect(frame.locator('[data-test="structural-destination"]')).toContainText("Move this card");
  await expect(appLocator(page, '[data-test="structural-destination"]')).toContainText("Move this card");
  await expect(appLocator(page, '[data-test="structural-move-target"]')).toHaveCSS("color", "rgb(180, 83, 9)");
});

test("dev: a cross-container move can append into an empty grid", async ({ page }) => {
  await page.goto("/playground");
  const source = appLocator(page, '[data-test="structural-move-target"]');
  const destination = appLocator(page, '[data-test="structural-empty-grid"]');

  await dragIntoContainer(page, source, destination, page.locator('[data-test="canvas-dom-drop-line"]'));
  await expect(destination.locator('[data-test="structural-move-target"]')).toHaveCount(1);
  await expect(source).toHaveCSS("color", "rgb(22, 101, 52)");

  await expect(page.locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible({ timeout: 20000 });
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await expect(frame.locator('[data-test="structural-empty-grid"] [data-test="structural-move-target"]')).toHaveCount(1);
});

test("dev: a cross-container move can place an item after an anchor in a row-reverse destination", async ({ page }) => {
  await page.goto("/playground");
  const source = appLocator(page, '[data-test="structural-move-target"]');
  const anchor = appLocator(page, '[data-test="structural-anchor"]');
  const destination = appLocator(page, '[data-test="structural-destination"]');
  await destination.evaluate((element) => {
    (element as HTMLElement).style.flexDirection = "row-reverse";
  });

  await dragBefore(page, source, anchor, page.locator('[data-test="canvas-dom-drop-line"]'), undefined, true);
  const cards = destination.locator(".structural-move-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toHaveClass(/structural-move-card--anchor/);
  await expect(cards.nth(1)).toHaveClass(/structural-move-card--target/);
});

test("dev: cross-container moves support undo, redo, revert, and clear", async ({ page }) => {
  await page.goto("/playground");
  const source = appLocator(page, '[data-test="structural-move-target"]');
  const anchor = appLocator(page, '[data-test="structural-anchor"]');
  const sourceContainer = appLocator(page, '[data-test="structural-source"]');
  const destination = appLocator(page, '[data-test="structural-destination"]');

  await dragBefore(page, source, anchor, page.locator('[data-test="canvas-dom-drop-line"]'));
  await expect(destination).toContainText("Move this card");
  await page.keyboard.press("Control+z");
  await expect(sourceContainer).toContainText("Move this card");
  await page.keyboard.press("Control+Shift+z");
  await expect(destination).toContainText("Move this card");

  await page.locator('[data-test="changes-toggle"]').click();
  await page.locator('[data-test="dom-change-revert"]').click();
  await expect(sourceContainer).toContainText("Move this card");
  await expect(destination).not.toContainText("Move this card");

  await dragBefore(page, source, anchor, page.locator('[data-test="canvas-dom-drop-line"]'));
  await expect(destination).toContainText("Move this card");
  await expect(page.locator('[data-test="changes-toggle"]')).toBeVisible();
  await page.reload();
  await expect(appLocator(page, '[data-test="structural-destination"]')).toContainText("Move this card");
  await expect(page.locator('[data-test="clear-session"]')).toBeVisible();
  await page.locator('[data-test="clear-session"]').click();
  await expect(appLocator(page, '[data-test="structural-source"]')).toContainText("Move this card");
  await expect(appLocator(page, '[data-test="structural-destination"]')).not.toContainText("Move this card");
});

test("dev: a cross-container snapshot reaches every ready Canvas card", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible({ timeout: 20000 });
  await page.locator('[data-test^="canvas-card-duplicate-"]').click();
  await expect(page.locator(".canvas-card__iframe")).toHaveCount(2);
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible({ timeout: 20000 });

  const first = page.frameLocator(".canvas-card__iframe").nth(0);
  const second = page.frameLocator(".canvas-card__iframe").nth(1);
  await dragBefore(
    page,
    first.locator('[data-test="structural-move-target"]'),
    first.locator('[data-test="structural-anchor"]'),
    page.locator('[data-test="canvas-dom-drop-line"]'),
  );

  await expect(first.locator('[data-test="structural-destination"]')).toContainText("Move this card");
  await expect(second.locator('[data-test="structural-destination"]')).toContainText("Move this card");
});

test("dev: an application snap-back reports a cross-container preview override without reapplying it", async ({ page }) => {
  await page.goto("/playground");
  const source = appLocator(page, '[data-test="structural-move-target"]');
  const anchor = appLocator(page, '[data-test="structural-anchor"]');
  await dragBefore(page, source, anchor, page.locator('[data-test="canvas-dom-drop-line"]'));
  await expect(appLocator(page, '[data-test="structural-destination"]')).toContainText("Move this card");

  await (await getAppFrame(page)).evaluate(() => {
    // Simulate the authored React tree winning reconciliation. The real
    // framework owns this parent relationship; the inspector must report the
    // conflict and leave the application-owned placement alone.
    window.__nudgeUiRerender?.();
    const source = document.querySelector('[data-test="structural-source"]');
    const target = document.querySelector('[data-test="structural-move-target"]');
    if (!source || !target) throw new Error("Expected structural move fixture");
    source.insertBefore(target, source.firstElementChild);
  });
  await expect(appLocator(page, '[data-test="structural-destination"]')).not.toContainText("Move this card");
  await expect(appLocator(page, '[data-test="structural-source"]')).toContainText("Move this card");
  await page.locator('[data-test="changes-toggle"]').click();
  await expect(page.locator('[data-test="structural-diagnostic"][data-document^="Canvas "][data-status="overridden"][data-reason="react-override"]')).toBeVisible();
  await page.waitForTimeout(100);
  await expect(appLocator(page, '[data-test="structural-source"]')).toContainText("Move this card");
});

test("dev: editing surface centres a flex-row insertion guide in a space-between gap", async ({ page }) => {
  await page.goto("/playground");
  await dragIntoFlexGap(
    page,
    appLocator(page, '[data-test="flex-child-a"]'),
    appLocator(page, '[data-test="flex-child-b"]'),
    appLocator(page, '[data-test="flex-child-c"]'),
    page.locator('[data-test="canvas-dom-drop-line"]'),
  );
  await expect.poll(() => appLocator(page, '[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");
});

test("dev: editing surface deletes the selected tracked element with the macOS Backspace key and records the removal", async ({ page }) => {
  await page.goto("/playground");
  const heading = appLocator(page, "#hero-title");
  await heading.click();
  await page.keyboard.press("Backspace");

  await expect(heading).not.toBeAttached();
  await page.locator('[data-test="changes-toggle"]').click();
  await expect(page.locator('[data-test="dom-change-row"][data-action="delete"]')).toBeVisible();

  await expect(page.locator('[data-test="clear-session"]')).toBeVisible();
  await page.locator('[data-test="clear-session"]').click();
  await expect(appLocator(page, "#hero-title")).toBeVisible();
  await expect(page.locator('[data-test="changes-log"]')).not.toBeAttached();
  await expect(page.locator('[data-test="clear-session"]')).not.toBeAttached();
});

test("dev: editing surface revert and undo/redo operate on canonical structural history", async ({ page }) => {
  await page.goto("/playground");
  const repeated = page.frameLocator(".canvas-card__iframe").first().getByText("Repeated 3", { exact: true });
  await repeated.click();
  await page.keyboard.press("Backspace");
  await expect(repeated).not.toBeAttached();

  await page.locator('[data-test="changes-toggle"]').click();
  await expect(page.locator('[data-test="structural-source-site"]')).toContainText("RepeatedItem");
  await expect(page.locator('[data-test="structural-scope"]')).toHaveText("This rendered item only");
  await page.locator('[data-test="dom-change-revert"]').click();
  await expect(page.frameLocator(".canvas-card__iframe").first().getByText("Repeated 3", { exact: true })).toBeVisible();

  await repeated.click();
  await page.keyboard.press("Backspace");
  await expect(repeated).not.toBeAttached();
  await page.keyboard.press("Control+z");
  await expect(page.frameLocator(".canvas-card__iframe").first().getByText("Repeated 3", { exact: true })).toBeVisible();
  await page.keyboard.press("Control+Shift+z");
  await expect(page.frameLocator(".canvas-card__iframe").first().getByText("Repeated 3", { exact: true })).not.toBeAttached();
});

test("dev: Canvas revert and undo/redo are controller-owned and the card reload keeps the current history", async ({ page }) => {
  await page.goto("/playground");
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
  const repeated = page.frameLocator(".canvas-card__iframe").first().getByText("Repeated 3", { exact: true });
  await repeated.click();
  await page.keyboard.press("Backspace");
  await expect(repeated).not.toBeAttached();

  await (await getAppFrame(page)).evaluate(() => {
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
  await expect(page.locator('[data-test="structural-diagnostic"][data-document^="Canvas "][data-status="overridden"]')).toBeVisible();
  await expect(appLocator(page, '[data-application-rendered="true"]')).toHaveText("Application replacement");
  await page.waitForTimeout(100);
  await expect(appLocator(page, '[data-application-rendered="true"]')).toHaveText("Application replacement");
});

test("dev: duplicate structural evidence refuses an ambiguous delete", async ({ page }) => {
  await page.goto("/playground");
  const target = page.frameLocator(".canvas-card__iframe").first().getByText("Repeated 3", { exact: true });
  await target.click();

  // Keep the selected element, but add an indistinguishable rendered sibling
  // before creating intent. The structural resolver must decline to guess.
  await (await getAppFrame(page)).evaluate(() => {
    const original = Array.from(document.querySelectorAll<HTMLElement>(".repeated-item"))
      .find((element) => element.textContent?.trim() === "Repeated 3");
    if (!original?.parentElement) throw new Error("Expected repeated target");
    const duplicate = original.cloneNode(true) as HTMLElement;
    duplicate.removeAttribute("data-projection-instance");
    original.parentElement.append(duplicate);
  });

  await page.keyboard.press("Backspace");
  await expect(appLocator(page, ".repeated-item").filter({ hasText: "Repeated 3" })).toHaveCount(2);
  await expect(page.locator('[data-test="changes-toggle"]')).toHaveCount(0);
});

test("dev: the same Canvas edit keeps diagnostics separate per document", async ({ page }) => {
  await page.goto("/playground");
  const board = page.locator('[data-test="canvas-board"]');
  await expect(board.locator(".canvas-card")).toHaveCount(1);
  await page.locator('[data-test^="canvas-card-duplicate-"]').first().click();
  await expect(board.locator(".canvas-card")).toHaveCount(2);
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible({ timeout: 20000 });

  const cards = board.locator(".canvas-card");
  const sourceFrame = cards.nth(0).locator(".canvas-card__iframe").contentFrame();
  const replacementFrame = cards.nth(1).locator(".canvas-card__iframe").contentFrame();

  const target = sourceFrame.getByText("Repeated 3", { exact: true });
  const identity = await target.evaluate((element) => ({
    cid: element.getAttribute("data-cid"),
    src: element.getAttribute("data-src"),
    text: element.textContent,
  }));
  await target.click();
  await target.press("Backspace");
  await page.locator('[data-test="changes-toggle"]').click();
  await expect(page.locator(
    '[data-test="structural-diagnostic"][data-document^="Canvas "][data-status="applied"]',
  )).toHaveCount(2);

  await replacementFrame.locator("body").evaluate((_, { cid, src, text }) => {
    const list = document.querySelector('[data-test="repeated-items"]');
    const placeholder = Array.from(list?.childNodes ?? []).find((node) =>
      node.nodeType === Node.COMMENT_NODE && node.nodeValue === "nudge-ui-deleted");
    if (!placeholder) throw new Error("Expected Canvas deletion placeholder");
    const replacement = document.createElement("button");
    replacement.className = "repeated-item";
    if (cid) replacement.setAttribute("data-cid", cid);
    if (src) replacement.setAttribute("data-src", src);
    replacement.textContent = text ?? "Repeated 3";
    placeholder.replaceWith(replacement);
  }, identity);

  await expect(page.locator(
    '[data-test="structural-diagnostic"][data-document^="Canvas "][data-status="applied"]',
  )).toHaveCount(1);
  await expect(page.locator(
    '[data-test="structural-diagnostic"][data-document^="Canvas "][data-status="overridden"]',
  )).toHaveCount(1);
});

test("dev: editing surface DOM moves survive switching to Canvas", async ({ page }) => {
  await page.goto("/playground");
  await dragBefore(
    page,
    appLocator(page, '[data-test="flex-child-a"]'),
    appLocator(page, '[data-test="flex-child-c"]'),
    page.locator('[data-test="canvas-dom-drop-line"]'),
    page.locator('[data-test="canvas-dom-drop-target"]'),
  );

  await expect.poll(() => appLocator(page, '[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await expect.poll(() => frame.locator('[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");
});

test("dev: editing surface arrow keys reorder a selected sibling", async ({ page }) => {
  await page.goto("/playground");
  const first = appLocator(page, '[data-test="flex-child-a"]');
  await first.click();
  const outline = page.locator('[data-test="canvas-selected-outline"]');
  await expect(outline).toBeVisible();
  const before = await outline.boundingBox();
  await page.keyboard.press("ArrowDown");

  await expect.poll(() => appLocator(page, '[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");
  await expect.poll(async () => (await outline.boundingBox())?.x ?? 0).toBeGreaterThan(before?.x ?? 0);

  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible({ timeout: 20000 });
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await expect(frame.locator("body")).toBeVisible({ timeout: 20000 });
  await expect.poll(() => frame.locator('[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");
});

test("dev: editing surface selected outline follows a position-only flex-column nudge", async ({ page }) => {
  await page.goto("/playground");
  const selected = page.frameLocator(".canvas-card__iframe").first().getByText("Repeated 1", { exact: true });
  const outline = page.locator('[data-test="canvas-selected-outline"]');
  await selected.scrollIntoViewIfNeeded();
  await selected.click();
  await page.mouse.move(0, 0);
  await expect(outline).toBeVisible();

  const before = await Promise.all([selected.boundingBox(), outline.boundingBox()]);
  await page.keyboard.press("ArrowDown");

  await expect(appLocator(page, '[data-test="repeated-items"] .repeated-item')).toHaveText([
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

  await expect.poll(() => appLocator(page, '[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");
});

test("dev: Canvas selected outline follows a position-only flex-column nudge", async ({ page }) => {
  await page.goto("/playground");
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

test("dev: editing surface deletes one repeated item in Canvas and a reloaded card receives the delete", async ({ page }) => {
  await page.goto("/playground");
  const repeated = page.frameLocator(".canvas-card__iframe").first().getByText("Repeated 3", { exact: true });
  await repeated.click();
  await page.keyboard.press("Backspace");
  await expect(repeated).not.toBeAttached();
  await expect(appLocator(page, ".repeated-item")).toHaveText([
    "Repeated 1", "Repeated 2", "Repeated 4", "Repeated 5", "Repeated 6",
  ]);

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

test("dev: deleting a repeated item keeps the unified workspace active", async ({ page }) => {
  await page.goto("/playground");
  const frame = page.frameLocator(".canvas-card__iframe").first();
  const repeated = frame.getByText("Repeated 3", { exact: true });
  await expect(repeated).toBeVisible();
  await repeated.click();
  await repeated.press("Backspace");
  await expect(repeated).not.toBeAttached();
  await expect(frame.locator(".repeated-item")).toHaveText([
    "Repeated 1", "Repeated 2", "Repeated 4", "Repeated 5", "Repeated 6",
  ]);

  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await expect(page.locator('[data-test="changes-toggle"]')).toBeVisible();
});

test("dev: Canvas delete-only projection advances into every already-ready card", async ({ page }) => {
  await page.goto("/playground");
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
  const frame = page.frameLocator(".canvas-card__iframe").first();
  const first = frame.locator('[data-test="flex-child-a"]');
  await first.click();
  await first.press("ArrowRight");

  await expect.poll(() => frame.locator('[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");

  await expect.poll(() => appLocator(page, '[data-test="flex-container"]').evaluate((element) => element.textContent)).toBe("BAC");
});

test("dev: a Canvas reload receives the current sibling reorder snapshot", async ({ page }) => {
  await page.goto("/playground");
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
  const selected = page.frameLocator(".canvas-card__iframe").first().getByText("Repeated 3", { exact: true });
  await selected.click();
  await page.keyboard.press("ArrowDown");

  const expectedOrder = ["Repeated 1", "Repeated 2", "Repeated 4", "Repeated 3", "Repeated 5", "Repeated 6"];
  await expect(appLocator(page, ".repeated-item")).toHaveText(expectedOrder);
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await expect(frame.locator(".repeated-item")).toHaveText(expectedOrder);
});
