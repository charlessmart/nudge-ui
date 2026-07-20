import { test, expect } from "@playwright/test";

async function waitForEditors(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const sr = document.getElementById("design-tool-root")?.shadowRoot;
        return !!sr?.querySelector('[data-test="style-editors"]');
      });
    }, { timeout: 5000 })
    .toBe(true);
}

async function sheetText(page: import("@playwright/test").Page): Promise<string> {
  return await page.evaluate(() => document.getElementById("design-tool-styles")?.textContent ?? "");
}

async function setSelect(page: import("@playwright/test").Page, testId: string, value: string): Promise<void> {
  await page.locator(`[data-test="${testId}"]`).click();
  const option = page.locator(`.dt-select__item:visible[data-value="${value}"]`);
  await expect(option).toBeVisible();
  await option.click();
}

async function setInput(page: import("@playwright/test").Page, property: string, value: string): Promise<void> {
  await page.evaluate(({ p, v }) => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
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

async function selectValues(page: import("@playwright/test").Page, testId: string): Promise<string[]> {
  const trigger = page.locator(`[data-test="${testId}"]`);
  await trigger.click();
  const items = page.locator(".dt-select__item:visible");
  await expect(items.first()).toBeVisible();
  const values = await items.evaluateAll((elements) => elements.map((item) => item.getAttribute("data-value") ?? ""));
  await trigger.click();
  return values;
}

async function computedPropOn(page: import("@playwright/test").Page, testId: string, prop: string): Promise<string> {
  return await page.evaluate(({ t, p }) => {
    const el = document.querySelector(`[data-test="${t}"]`) as HTMLElement | null;
    return el ? getComputedStyle(el).getPropertyValue(p) : "";
  }, { t: testId, p: prop });
}

async function shadowQueryExists(page: import("@playwright/test").Page, testId: string): Promise<boolean> {
  return await page.evaluate((t) => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    return !!sr?.querySelector(`[data-test="${t}"]`);
  }, testId);
}

async function changesLogText(page: import("@playwright/test").Page): Promise<string> {
  return await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const log = sr?.querySelector('[data-test="changes-log"]');
    return log?.textContent ?? "";
  });
}

async function revertChange(page: import("@playwright/test").Page, property: string): Promise<void> {
  const row = page.locator(`[data-test="change-row"][data-property="${property}"]`);
  await expect(row).toHaveCount(1);
  await row.locator('[data-test="change-revert"]').click();
}

test("dev: layout section shows flex container controls and edits write to managed stylesheet", async ({ page }) => {
  await page.goto("/");

  await page.evaluate(() => (document.querySelector('[data-test="flex-container"]') as HTMLElement | null)?.click());
  await waitForEditors(page);
  await expect.poll(async () => shadowQueryExists(page, "layout-flex-container"), { timeout: 5000 }).toBe(true);

  // Layout section should be visible
  const layoutSection = await shadowQueryExists(page, "layout-section");
  expect(layoutSection).toBe(true);

  const displaySelect = page.locator('[data-test="layout-select-display"]');
  await expect(displaySelect).toHaveAttribute("role", "combobox");
  await expect(displaySelect.locator(".dt-select__icon")).toBeVisible();

  // Flex container sub-section should be visible
  const flexContainer = await shadowQueryExists(page, "layout-flex-container");
  expect(flexContainer).toBe(true);

  // The compact flex direction control should expose row as the active state.
  const rowDirectionActive = await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const control = sr?.querySelector('[data-test="layout-direction-row"]');
    return control?.getAttribute("aria-pressed") === "true";
  });
  expect(rowDirectionActive).toBe(true);

  // Change flex-direction to column.
  await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    (sr?.querySelector('[data-test="layout-direction-column"]') as HTMLButtonElement | null)?.click();
  });

  // Computed style should update
  await expect
    .poll(async () => computedPropOn(page, "flex-container", "flex-direction"), { timeout: 5000 })
    .toBe("column");

  // Managed stylesheet should have the rule
  await expect
    .poll(async () => {
      const s = await sheetText(page);
      return s.includes("flex-direction: column");
    }, { timeout: 5000 })
    .toBe(true);

  // ChangesLog should show the edit
  await expect
    .poll(async () => {
      const log = await changesLogText(page);
      return log.toLowerCase().includes("flex direction");
    }, { timeout: 5000 })
    .toBe(true);
});

test("dev: layout section shows flex child controls when selecting a child of a flex container", async ({ page }) => {
  await page.goto("/");

  await page.click('[data-test="flex-child-a"]');
  await waitForEditors(page);
  await expect.poll(async () => shadowQueryExists(page, "layout-flex-child"), { timeout: 5000 }).toBe(true);

  // Layout section should be visible
  expect(await shadowQueryExists(page, "layout-section")).toBe(true);

  // Flex child sub-section should be visible (parent is flex)
  expect(await shadowQueryExists(page, "layout-flex-child")).toBe(true);

  // Flex child properties should be present
  const hasAlignSelf = await shadowQueryExists(page, "layout-select-align-self");
  expect(hasAlignSelf).toBe(true);

  // Flex-grow combo field should be present
  const hasFlexGrow = await shadowQueryExists(page, "layout-combo-select-flex-grow");
  expect(hasFlexGrow).toBe(true);

  const positionSelect = page.locator('[data-test="layout-select-position"]');
  await positionSelect.focus();
  await positionSelect.press("r");
  await expect(positionSelect).toContainText("Relative");

  const flexBasisOptions = await selectValues(page, "layout-combo-select-flex-basis");
  expect(flexBasisOptions).toContain("auto");
  await setSelect(page, "layout-combo-select-flex-basis", "auto");
  await expect
    .poll(async () => (await sheetText(page)).includes("flex-basis: auto"), { timeout: 5000 })
    .toBe(true);

  await page.mouse.move(0, 0);

  // Change flex-grow to 2
  await setSelect(page, "layout-combo-select-flex-grow", "2");

  // Computed style should update
  await expect
    .poll(async () => computedPropOn(page, "flex-child-a", "flex-grow"), { timeout: 5000 })
    .toBe("2");

  // Managed stylesheet should have the rule
  await expect
    .poll(async () => (await sheetText(page)).includes("flex-grow: 2"), { timeout: 5000 })
    .toBe(true);
});

test("dev: layout section shows inset controls for a positioned element", async ({ page }) => {
  await page.goto("/");

  await page.click('[data-test="positioned-box"]');
  await waitForEditors(page);

  // Layout section should be visible
  expect(await shadowQueryExists(page, "layout-section")).toBe(true);

  // Inset sub-section should be visible (position is relative)
  expect(await shadowQueryExists(page, "layout-inset")).toBe(true);

  // Top inset should use the regular token/raw input.
  await expect(page.locator('[data-test="token-field"][data-property="top"] [data-test="raw-input"]')).toBeVisible();
  expect(await shadowQueryExists(page, "layout-combo-select-top")).toBe(false);

  // Change top from "0" to "auto"
  await setInput(page, "top", "auto");

  // Managed stylesheet should have the rule
  await expect
    .poll(async () => (await sheetText(page)).includes("top: auto"), { timeout: 5000 })
    .toBe(true);

  // ChangesLog should show the edit
  await expect
    .poll(async () => {
      const log = await changesLogText(page);
      return log.toLowerCase().includes("top");
    }, { timeout: 5000 })
    .toBe(true);
});

test("dev: positioned layout edits move the element and revert cleanly", async ({ page }) => {
  await page.goto("/");
  await page.click('[data-test="positioned-box"]');
  await waitForEditors(page);

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
