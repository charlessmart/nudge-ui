import { test, expect } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";
import { getAppFrame, openEditor } from "@nudge-ui/compatibility/playwright";

async function waitForEditors(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
        return !!sr?.querySelector('[data-test="style-editors"]');
      });
    }, { timeout: 5000 })
    .toBe(true);
}

async function sheetText(page: import("@playwright/test").Page): Promise<string> {
  return managedSheetText(page);
}

async function setSelect(page: import("@playwright/test").Page, testId: string, value: string): Promise<void> {
  await page.locator(`[data-test="${testId}"]`).click();
  const option = page.locator(`.select__item:visible[data-value="${value}"]`);
  await expect(option).toBeVisible();
  await option.click();
}

async function setInput(page: import("@playwright/test").Page, property: string, value: string): Promise<void> {
  await page.evaluate(({ p, v }) => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    const input = sr?.querySelector(
      `[data-test="token-field"][data-property="${p}"] [data-test="raw-input"]`,
    ) as HTMLInputElement | null;
    if (!input) throw new Error(`Missing raw input for ${p}`);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    input.focus();
    setter.call(input, v);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
  }, { p: property, v: value });
}

/** Waits for a size field or its menu item, since flex/grid recognition can settle after the first render. */
async function showSizeSetting(
  page: import("@playwright/test").Page,
  dimension: "width" | "height",
  setting: string,
  field = `layout-size-${setting}`,
): Promise<void> {
  const target = page.locator(`[data-test="${field}"]`);
  const item = page.locator(`[data-test="layout-size-add-${setting}"]`);
  if (!(await target.isVisible())) {
    await page.locator(`[data-test="layout-size-${dimension}-options"]`).click();
    await expect(item.or(target)).toBeVisible();
    // A limit that is already shown stays in the menu, dimmed, so only pick an entry that is still available.
    if (!(await target.isVisible()) && await item.isEnabled()) await item.click();
  }
  await expect(target).toBeVisible();
}

async function setLayoutInput(page: import("@playwright/test").Page, testId: string, value: string): Promise<void> {
  const input = page.locator(`[data-test="${testId}"] [data-test="raw-input"], [data-test="${testId}"] [data-test$="-input"]`).first();
  await expect(input).toBeVisible();
  await input.fill(value);
  await input.blur();
}

async function computedPropOn(page: import("@playwright/test").Page, testId: string, prop: string): Promise<string> {
  return await (await getAppFrame(page)).evaluate(({ t, p }) => {
    const el = document.querySelector(`[data-test="${t}"]`) as HTMLElement | null;
    return el ? getComputedStyle(el).getPropertyValue(p) : "";
  }, { t: testId, p: prop });
}

async function shadowQueryExists(page: import("@playwright/test").Page, testId: string): Promise<boolean> {
  return await page.evaluate((t) => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    return !!sr?.querySelector(`[data-test="${t}"]`);
  }, testId);
}

async function changesLogText(page: import("@playwright/test").Page): Promise<string> {
  return await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    const log = sr?.querySelector('[data-test="changes-log"]');
    return log?.textContent ?? "";
  });
}

async function revertChange(page: import("@playwright/test").Page, property: string): Promise<void> {
  const row = page.locator(`[data-test="change-row"][data-property="${property}"]`);
  await expect(row).toHaveCount(1);
  await page.locator('[data-test="changes-toggle"]').click();
  await row.locator('[data-test="change-revert"]').click();
}

test("dev: layout section shows flex container controls and edits write to managed stylesheet", async ({ page }) => {
  await openEditor(page, "/playground");

  await (await getAppFrame(page)).locator('[data-test="flex-container"]').click({ position: { x: 2, y: 2 } });
  await waitForEditors(page);
  await expect.poll(async () => shadowQueryExists(page, "layout-flex-container"), { timeout: 5000 }).toBe(true);

  const layoutSection = await shadowQueryExists(page, "layout-section");
  expect(layoutSection).toBe(true);

  await expect(page.locator('[data-test="layout-mode-control"]')).toBeVisible();

  const flexContainer = await shadowQueryExists(page, "layout-flex-container");
  expect(flexContainer).toBe(true);

  const rowDirectionActive = await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    const control = sr?.querySelector('[data-test="layout-mode-row"]');
    return control?.getAttribute("aria-pressed") === "true";
  });
  expect(rowDirectionActive).toBe(true);

  const initialGapProperties = await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    return Array.from(sr?.querySelectorAll('[data-test="layout-gap"] [data-test="layout-combo"]') ?? [])
      .map((field) => field.getAttribute("data-property"));
  });
  expect(initialGapProperties).toEqual(["column-gap"]);

  const columnGapInput = page.locator('[data-test="layout-gap"] [data-test="layout-combo-input-column-gap"]');
  await expect(columnGapInput).toBeVisible();
  await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    (sr?.querySelector('[data-test="layout-flex-wrap-toggle"]') as HTMLButtonElement | null)?.click();
  });
  await expect
    .poll(async () => computedPropOn(page, "flex-container", "flex-wrap"), { timeout: 5000 })
    .toBe("wrap");
  await expect.poll(async () => page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    return Array.from(sr?.querySelectorAll('[data-test="layout-gap"] [data-test="layout-combo"]') ?? [])
      .map((field) => field.getAttribute("data-property"))
      .sort();
  }), { timeout: 5000 }).toEqual(["column-gap", "row-gap"]);

  await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    (sr?.querySelector('[data-test="layout-mode-column"]') as HTMLButtonElement | null)?.click();
  });

  await expect
    .poll(async () => computedPropOn(page, "flex-container", "flex-direction"), { timeout: 5000 })
    .toBe("column");

  // In a column layout the align grid's top-right cell means top + right: justify-content: flex-start, align-items: flex-end.
  await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    (sr?.querySelector('[data-test="layout-align-flex-end-flex-start"]') as HTMLButtonElement | null)?.click();
  });
  await expect
    .poll(async () => computedPropOn(page, "flex-container", "justify-content"), { timeout: 5000 })
    .toBe("flex-start");
  await expect
    .poll(async () => computedPropOn(page, "flex-container", "align-items"), { timeout: 5000 })
    .toBe("flex-end");

  // Lower-frequency flex settings live behind the layout options menu.
  await page.locator('[data-test="layout-options"]').click();
  await expect(page.locator('[data-test="layout-select-align-content"]')).toBeVisible();
  await page.locator('[data-test="layout-options"]').click();
  await page.locator('[data-test="layout-flex-distribution"]').click();
  await page.locator('[data-test="layout-flex-distribution-space-between"]').click();
  await expect
    .poll(async () => computedPropOn(page, "flex-container", "justify-content"), { timeout: 5000 })
    .toBe("space-between");
  await expect(page.locator('[data-test="layout-combo-input-column-gap"]')).toHaveValue("Auto");
  await page.locator('[data-test="layout-flex-distribution"]').click();
  await page.locator('[data-test="layout-flex-distribution-space-around"]').click();
  await expect
    .poll(async () => computedPropOn(page, "flex-container", "justify-content"), { timeout: 5000 })
    .toBe("space-around");
  await page.locator('[data-test="layout-options"]').click();
  await setSelect(page, "layout-select-align-items", "stretch");
  await expect
    .poll(async () => computedPropOn(page, "flex-container", "align-items"), { timeout: 5000 })
    .toBe("stretch");

  await setSelect(page, "layout-select-align-content", "center");
  await expect
    .poll(async () => computedPropOn(page, "flex-container", "align-content"), { timeout: 5000 })
    .toBe("center");
  await page.keyboard.press("Escape");

  await expect
    .poll(async () => {
      const s = await sheetText(page);
      return s.includes("flex-direction: column");
    }, { timeout: 5000 })
    .toBe(true);

  await expect
    .poll(async () => {
      const log = await changesLogText(page);
      return log.toLowerCase().includes("flex direction");
    }, { timeout: 5000 })
    .toBe(true);
});

test("dev: layout options offer flex child fields when selecting a child of a flex container", async ({ page }) => {
  await openEditor(page, "/playground");

  await (await getAppFrame(page)).locator('[data-test="flex-child-a"]').click();
  await waitForEditors(page);

  expect(await shadowQueryExists(page, "layout-section")).toBe(true);
  // The item fields live in the layout options menu rather than a row of their own.
  expect(await shadowQueryExists(page, "layout-flex-child")).toBe(false);

  await page.locator('[data-test="layout-options"]').click();
  await expect(page.locator('[data-test="layout-options-flex-child"]')).toBeVisible();
  await expect(page.locator('[data-test="layout-select-align-self"]')).toBeVisible();
  await expect(page.locator('[data-test="layout-combo-input-order"]')).toBeVisible();

  // Position starts static, so it is set from the same menu.
  const positionSelect = page.locator('[data-test="layout-select-position"]');
  await positionSelect.focus();
  await positionSelect.press("r");
  await expect(positionSelect).toContainText("Relative");

  const flexBasisInput = page.locator('[data-test="layout-combo-input-flex-basis"]');
  await expect(flexBasisInput).toBeVisible();
  await flexBasisInput.fill("auto");
  await flexBasisInput.blur();
  await expect
    .poll(async () => (await sheetText(page)).includes("flex-basis: auto"), { timeout: 5000 })
    .toBe(true);

  const flexGrowInput = page.locator('[data-test="layout-combo-input-flex-grow"]');
  await flexGrowInput.fill("2");
  await flexGrowInput.blur();

  await expect
    .poll(async () => computedPropOn(page, "flex-child-a", "flex-grow"), { timeout: 5000 })
    .toBe("2");

  await expect
    .poll(async () => (await sheetText(page)).includes("flex-grow: 2"), { timeout: 5000 })
    .toBe(true);
});

test("dev: layout section shows inset controls for a positioned element", async ({ page }) => {
  await openEditor(page, "/playground");

  await (await getAppFrame(page)).locator('[data-test="positioned-box"]').click();
  await waitForEditors(page);

  expect(await shadowQueryExists(page, "layout-section")).toBe(true);

  // Empty insets stay out of the section until they are added from the layout options.
  expect(await shadowQueryExists(page, "layout-inset")).toBe(false);
  await page.locator('[data-test="layout-options"]').click();
  await expect(page.locator('[data-test="add-inset"]')).toBeEnabled();
  await page.locator('[data-test="add-inset"]').click();
  await expect(page.locator('[data-test="layout-options-content"]')).toHaveCount(0);
  await page.locator('[data-test="layout-options"]').click();
  await expect(page.locator('[data-test="add-inset"]')).toBeDisabled();
  await page.locator('[data-test="layout-options"]').click();
  expect(await page.locator('[data-test="layout-section"] [data-test="layout-inset"]').count()).toBe(1);

  await expect(page.locator('[data-test="layout-inset"] [data-test="pair-value-horizontal"]')).toBeVisible();
  await expect(page.locator('[data-test="layout-inset"] [data-test="pair-value-vertical"]')).toBeVisible();
  await page.locator('[data-test="layout-inset"] [data-test="individual-sides"]').click();

  await expect(page.locator('[data-test="token-field"][data-property="top"] [data-test="raw-input"]')).toBeVisible();
  expect(await shadowQueryExists(page, "layout-combo-select-top")).toBe(false);
  await setInput(page, "top", "auto");

  await expect
    .poll(async () => (await sheetText(page)).includes("top: auto"), { timeout: 5000 })
    .toBe(true);

  await expect
    .poll(async () => {
      const log = await changesLogText(page);
      return log.toLowerCase().includes("top");
    }, { timeout: 5000 })
    .toBe(true);
});

test("dev: positioned layout edits move the element and revert cleanly", async ({ page }) => {
  await openEditor(page, "/playground");
  await (await getAppFrame(page)).locator('[data-test="positioned-box"]').click();
  await waitForEditors(page);

  await page.locator('[data-test="layout-options"]').click();
  await page.locator('[data-test="add-inset"]').click();
  await page.locator('[data-test="layout-inset"] [data-test="individual-sides"]').click();
  await setInput(page, "left", "50%");

  await expect
    .poll(async () => (await sheetText(page)).includes("left: 50%"), { timeout: 5000 })
    .toBe(true);

  await revertChange(page, "left");

  await expect
    .poll(async () => (await sheetText(page)).includes("left: 50%"), { timeout: 5000 })
    .toBe(false);
  await expect
    .poll(async () => computedPropOn(page, "positioned-box", "left"), { timeout: 5000 })
    .toBe("0px");
});

test("dev: layout size controls edit dimensions and lock the aspect ratio", async ({ page }) => {
  await openEditor(page, "/playground");
  await (await getAppFrame(page)).locator('[data-test="sizing-box"]').click();
  await waitForEditors(page);

  await expect(page.locator('[data-test="layout-size"]')).toBeVisible();
  await setLayoutInput(page, "layout-size-width", "240");

  await showSizeSetting(page, "height", "max-height");
  await setLayoutInput(page, "layout-size-max-height", "40vh");

  // The fixture authors a 4 / 3 ratio, so the lock starts on. The ratio itself has no field of its own.
  const lock = page.locator('[data-test="layout-size-lock"]');
  await expect(lock).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-test="layout-size-aspect-ratio"]')).toHaveCount(0);

  // Unlocking writes auto; locking again measures the element's own proportions.
  await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "false");
  await expect.poll(async () => computedPropOn(page, "sizing-box", "aspect-ratio"), { timeout: 5000 }).toBe("auto");
  await expect.poll(async () => sheetText(page), { timeout: 5000 }).toContain("aspect-ratio: auto");

  await lock.click();
  await expect(lock).toHaveAttribute("aria-pressed", "true");
  await expect.poll(async () => computedPropOn(page, "sizing-box", "aspect-ratio"), { timeout: 5000 }).not.toBe("auto");

  await expect.poll(async () => computedPropOn(page, "sizing-box", "width"), { timeout: 5000 }).toBe("240px");
  await expect.poll(async () => computedPropOn(page, "sizing-box", "max-height"), { timeout: 5000 }).toMatch(/px$/);
  await expect.poll(async () => sheetText(page), { timeout: 5000 }).toContain("max-height: 40vh");
  await expect.poll(async () => sheetText(page), { timeout: 5000 }).toContain("width: 240px");
  await expect.poll(async () => sheetText(page), { timeout: 5000 }).toMatch(/aspect-ratio: \d+ \/ \d+/);
});

test("dev: absolute position exposes grouped and individual inset values", async ({ page }) => {
  await openEditor(page, "/playground");
  await (await getAppFrame(page)).locator('[data-test="right-anchored-box"]').click();
  await waitForEditors(page);

  await expect(page.locator('[data-test="layout-inset"]')).toBeVisible();
  const position = page.locator('[data-test="layout-inset"]');
  await expect(position).toHaveAttribute("data-expanded", "false");
  await expect(position.locator('[data-test="pair-value-horizontal"]')).toBeVisible();
  await expect(position.locator('[data-test="individual-sides"]')).toBeEnabled();
  await position.locator('[data-test="individual-sides"]').click();

  for (const side of ["top", "right", "bottom", "left"]) {
    await expect(position.locator(`[data-test="side-value-${side}"]`)).toBeVisible();
  }

  await expect(page.locator('[data-test^="layout-anchor-"]')).toHaveCount(0);

  await setInput(page, "right", "32");
  await setInput(page, "bottom", "18");
  await expect.poll(async () => computedPropOn(page, "right-anchored-box", "right"), { timeout: 5000 }).toBe("32px");
  await expect.poll(async () => computedPropOn(page, "right-anchored-box", "bottom"), { timeout: 5000 }).toBe("18px");
});

test("dev: Grid controls preserve authored track expressions and edit managed rules", async ({ page }) => {
  await openEditor(page, "/playground");
  const appFrame = await getAppFrame(page);
  await appFrame.locator('[data-test="grid-authored-container"]').click();
  await waitForEditors(page);

  await expect(page.locator('[data-test="layout-grid-container"]')).toBeVisible({ timeout: 10000 });
  const gridGap = page.locator('[data-test="layout-grid-gap"]');
  await expect(gridGap.locator('.layout__spacing-field')).toHaveCount(2);
  for (const property of ["row-gap", "column-gap"]) {
    const surface = gridGap.locator(`[data-test="layout-grid-${property}"]`);
    const token = surface.locator(`[data-test="token-field"][data-property="${property}"] [data-test="token-chip"]`);
    await expect(token).toBeVisible();
    await expect(token).toHaveAttribute("aria-label", `Change ${property} token`);
    await expect(surface.locator(`[data-test="layout-combo-input-${property}"]`)).toHaveCount(0);
  }
  const picker = page.locator('[data-test="layout-grid-picker-trigger"]');
  await expect(picker).toBeVisible();
  await picker.click();
  await expect(page.locator('[data-test="layout-grid-picker-popover"]')).toBeVisible();
  await page.locator('[data-test="layout-grid-cell-3-2"]').click();
  await expect.poll(async () => sheetText(page), { timeout: 5000 })
    .toMatch(/grid-template-columns: repeat\(3, minmax\(0(?:px)?, 1fr\)\)/);
  await expect.poll(async () => sheetText(page), { timeout: 5000 })
    .toMatch(/grid-template-rows: repeat\(2, minmax\(0(?:px)?, 1fr\)\)/);

  await page.locator('[data-test="layout-options"]').click();
  await expect(page.locator('[data-test="layout-options-popover"] [data-test="layout-grid-advanced"]')).toBeVisible();
  const columns = page.locator('[data-test="layout-grid-input-grid-template-columns"]');
  await expect(columns).toHaveValue(/repeat\(3, minmax\(0(?:px)?, 1fr\)\)/);
  await expect(page.locator('[data-test="layout-grid-input-grid-template-rows"]'))
    .toHaveValue(/repeat\(2, minmax\(0(?:px)?, 1fr\)\)/);

  await columns.fill("repeat(4, minmax(0, 1fr))");
  await columns.blur();
  await expect.poll(async () => sheetText(page), { timeout: 5000 })
    .toMatch(/grid-template-columns: repeat\(4, minmax\(0(?:px)?, 1fr\)\)/);
  await page.keyboard.press("Escape");

  await appFrame.locator('[data-test="grid-child-span"]').click();
  await waitForEditors(page);
  await showSizeSetting(page, "height", "child-placement", "layout-grid-child");
  await expect(page.locator('[data-test="layout-grid-child"]')).toBeVisible();

  const startInput = page.locator('[data-test="layout-grid-child-column-start"]');
  await expect(startInput).toHaveValue("2");
  await expect(page.locator('[data-test="layout-grid-child-fields"] > .field-row')).toHaveCount(4);
  await expect(page.locator('[data-test="layout-grid-child-settings"]')).toHaveCount(0);
  await expect(page.locator('[data-test^="layout-grid-child-action-"]')).toHaveCount(0);

  await startInput.fill("1");
  await startInput.blur();
  await expect.poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("grid-column-start: 1;");

  await page.locator('[data-test="layout-grid-child-align-h-center"]').click();
  await expect.poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("justify-self: center;");
  await expect.poll(async () => computedPropOn(page, "grid-child-span", "justify-self"), { timeout: 5000 })
    .toContain("center");
});

test("dev: Grid is selectable from the layout mode control", async ({ page }) => {
  await openEditor(page, "/playground");
  await (await getAppFrame(page)).locator('[data-test="grid-switch-target"]').click();
  await waitForEditors(page);
  await expect(page.locator('[data-test="layout-grid-container"]')).toHaveCount(0);

  await page.locator('[data-test="layout-mode-grid"]').click();
  await expect(page.locator('[data-test="layout-grid-container"]')).toBeVisible();
  await expect.poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("display: grid");
  await expect.poll(async () => computedPropOn(page, "grid-switch-target", "display"), { timeout: 5000 })
    .toBe("grid");
});
