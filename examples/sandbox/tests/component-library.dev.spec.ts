import { expect, test, type FrameLocator, type Page } from "@playwright/test";
import { showCanvas, waitForCanvasTransition } from "./canvasTransition.ts";
import { openEditor } from "@nudge-ui/compatibility/playwright";

// ADR-0045: the Components panel lists host contracts and opens component sheet frames on the canvas.
const BUTTON_ID = "src/ds/Button#Button";

function appFrame(page: Page): FrameLocator {
  return page.frameLocator('[data-test^="canvas-card-iframe-"]:not([src*="/__nudge_ui__/components"])').first();
}

function sheetFrame(page: Page): FrameLocator {
  return page.frameLocator('iframe[src*="/__nudge_ui__/components?component="]').first();
}

async function openButtonSheet(page: Page): Promise<void> {
  await openEditor(page, "/app?nudge-ui=editor");
  // The sheet opens beside the app frame on the Canvas; Focus shows one frame at a time.
  await showCanvas(page);
  await page.locator('[data-test="panel-view-components"]').click();
  const item = page.locator(`[data-test="component-library-item"][data-component-id="${BUTTON_ID}"]`);
  await item.click();
  await expect(page.locator('iframe[src*="/__nudge_ui__/components?component="]')).toHaveCount(1);
  await expect(sheetFrame(page).locator("[data-nudge-ui-component-sheet]")).toBeAttached({ timeout: 20000 });
  await expect(sheetFrame(page).locator("[data-nudge-ui-sheet-cell]").first()).toBeVisible();
}

async function setInput(page: Page, property: string, value: string): Promise<void> {
  await page.evaluate(({ property, value }) => {
    const root = document.getElementById("nudge-ui-root")?.shadowRoot;
    const input = root?.querySelector(
      `[data-test="token-field"][data-property="${property}"] [data-test="raw-input"]`,
    ) as HTMLInputElement | null;
    if (!input) throw new Error(`Missing inspector input for ${property}`);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    input.focus();
    setter.call(input, value);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
  }, { property, value });
}

const paddingLeft = (frame: FrameLocator, selector: string) =>
  frame.locator(selector).first().evaluate((el) => getComputedStyle(el).paddingLeft);

test("library panel lists Button under src/ds and opens a sheet frame beside the app frame", async ({ page }) => {
  await openEditor(page, "/app?nudge-ui=editor");
  // The sheet opens beside the app frame on the Canvas; Focus shows one frame at a time.
  await showCanvas(page);
  await page.locator('[data-test="panel-view-components"]').click();
  const panel = page.locator('[data-test="component-library"]');
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-test="component-library-item"]')).not.toHaveCount(0);
  const item = panel.locator(`[data-test="component-library-item"][data-component-id="${BUTTON_ID}"]`);
  await expect(item).toContainText("Button");
  await expect(item).toHaveAttribute("title", /src\/ds\/Button/);
  await expect(panel.locator('[data-test="component-library-group"][data-folder-id="src/ds"]')).toBeVisible();

  const cards = page.locator(".canvas-card");
  const before = await cards.count();
  await item.click();
  const sheet = page.locator('iframe[src*="/__nudge_ui__/components?component="]');
  await expect(sheet).toHaveCount(1);
  await expect(cards).toHaveCount(before + 1);
  await expect(item).toHaveAttribute("data-active", "true");

  const appIframe = page.locator('[data-test^="canvas-card-iframe-"]:not([src*="/__nudge_ui__/components"])').first();
  // Beside, not stacked: the frames occupy disjoint horizontal ranges once the canvas settles.
  await expect.poll(async () => {
    const [appBox, sheetBox] = await Promise.all([appIframe.boundingBox(), sheet.boundingBox()]);
    if (!appBox || !sheetBox) return false;
    return sheetBox.x + sheetBox.width <= appBox.x + 1 || sheetBox.x >= appBox.x + appBox.width - 1;
  }).toBe(true);
});

test("sheet renders state cells with variant tokens and forces the hover state", async ({ page }) => {
  await openButtonSheet(page);
  const sheet = sheetFrame(page);
  await expect(sheet.locator("[data-nudge-ui-component-sheet]")).toHaveAttribute("data-nudge-ui-component-sheet", /Button/);

  const states = await sheet.locator("[data-nudge-ui-sheet-cell]")
    .evaluateAll((cells) => [...new Set(cells.map((c) => c.getAttribute("data-nudge-ui-sheet-state")))]);
  expect(states).toEqual(expect.arrayContaining(["base", "hover", "disabled"]));

  const cellButton = (state: string) => sheet
    .locator(`[data-nudge-ui-sheet-cell][data-nudge-ui-sheet-state="${state}"][data-nudge-ui-variant*="Button.variant=primary"]`)
    .first().locator("button.ds-button--primary");
  const base = cellButton("base");
  const hover = cellButton("hover");
  await expect(base).toBeAttached();
  await expect(hover).toBeAttached();

  const bg = (loc: ReturnType<FrameLocator["locator"]>) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);
  await expect.poll(async () => (await bg(hover)) !== (await bg(base))).toBe(true);
});

test("live /app buttons carry variant markers", async ({ page }) => {
  await openEditor(page, "/app?nudge-ui=editor");
  const primary = appFrame(page).locator("button.ds-button--primary").first();
  await expect(primary).toHaveAttribute("data-nudge-ui-variant", /Button\.variant=primary/);
  await expect(appFrame(page).locator("button.ds-button--secondary").first())
    .toHaveAttribute("data-nudge-ui-variant", /Button\.variant=secondary/);
});

test("variant-scoped padding edit in the sheet reaches only primary buttons in both frames", async ({ page }) => {
  await openButtonSheet(page);
  const sheet = sheetFrame(page);
  const app = appFrame(page);
  await expect(app.locator("button.ds-button--primary").first()).toBeVisible();

  const secondary = ".ds-button--secondary.ds-button--sm";
  const secondaryAppBefore = await paddingLeft(app, secondary);
  const secondarySheetBefore = await paddingLeft(sheet, secondary);

  const cell = sheet
    .locator('[data-nudge-ui-sheet-cell][data-nudge-ui-sheet-state="base"][data-nudge-ui-variant*="Button.variant=primary"]')
    .first().locator("button.ds-button--primary");
  await expect(cell).toBeVisible();
  await waitForCanvasTransition(page);
  await cell.click();
  // Selecting leaves the panel on Components; edit the cell from Styles.
  await page.locator('[data-test="panel-view-styles"]').click();

  await expect(page.locator('[data-test="style-editors"]')).toBeVisible({ timeout: 10000 });
  const scope = page.locator('[data-test="variant-scope-select"]');
  await expect(scope).toBeVisible();
  // The sheet defaults to the cell's whole variant; widen it to every primary size.
  await expect(scope).toContainText("primary · ");
  await scope.click();
  await page.locator('[data-value="prop:variant"]').click();
  await expect(scope).toContainText("variant: primary");

  const spacing = page.locator('[data-test="spacing-padding"]');
  const add = spacing.locator('[data-test="add-value"]');
  if (await add.count()) await add.click();
  await setInput(page, "padding-horizontal", "28px");

  await expect.poll(() => paddingLeft(sheet, ".ds-button--primary")).toBe("28px");
  await expect.poll(() => paddingLeft(app, ".ds-button--primary")).toBe("28px");
  expect(await paddingLeft(sheet, secondary)).toBe(secondarySheetBefore);
  expect(await paddingLeft(app, secondary)).toBe(secondaryAppBefore);
  expect(secondaryAppBefore).toBe("12px");
});

test("a base background edit in the sheet leaves states with their own background alone", async ({ page }) => {
  await openButtonSheet(page);
  const sheet = sheetFrame(page);
  const criticalSm = '[data-nudge-ui-variant~="Button.variant=critical"][data-nudge-ui-variant~="Button.size=sm"]';
  const cellButton = (state: string, extra = "") => sheet
    .locator(`[data-nudge-ui-sheet-cell][data-nudge-ui-sheet-state="${state}"]${criticalSm}${extra}`)
    .first().locator("button");
  const background = (state: string, extra = "") => cellButton(state, extra)
    .evaluate((el) => getComputedStyle(el).backgroundColor);
  const notLoading = ':not([data-nudge-ui-variant~="Button.loading=true"])';
  const hoverBefore = await background("hover");
  const disabledBefore = await background("disabled");

  const base = cellButton("base", notLoading);
  await expect(base).toBeVisible();
  await waitForCanvasTransition(page);
  await base.click();
  await page.locator('[data-test="panel-view-styles"]').click();
  await expect(page.locator('[data-test="variant-scope-select"]')).toContainText("critical · sm");

  const fill = page.locator('[data-test="token-field"][aria-label="Background Color"]');
  await fill.locator('[data-test="delink-btn"]').click();
  const raw = fill.locator('[data-test="raw-input"]');
  await raw.fill("rgb(1, 2, 3)");
  await raw.press("Enter");

  await expect.poll(() => background("base", notLoading)).toBe("rgb(1, 2, 3)");
  // `.ds-button:active` and the loading column set no background, so they inherit the edit.
  await expect.poll(() => background("active")).toBe("rgb(1, 2, 3)");
  await expect.poll(() => background("loading")).toBe("rgb(1, 2, 3)");
  // `.ds-button--critical:hover` and `.ds-button:disabled` set their own, as they would after a source edit.
  expect(await background("hover")).toBe(hoverBefore);
  expect(await background("disabled")).toBe(disabledBefore);
  expect(hoverBefore).not.toBe("rgb(1, 2, 3)");
});
