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
  await page.evaluate(({ t, v }) => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const select = sr?.querySelector(`[data-test="${t}"]`) as HTMLSelectElement | null;
    if (!select) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
    setter.call(select, v);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, { t: testId, v: value });
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

test("dev: layout section shows flex container controls and edits write to managed stylesheet", async ({ page }) => {
  await page.goto("/");

  await page.click('[data-test="flex-container"]');
  await waitForEditors(page);

  // Layout section should be visible
  const layoutSection = await shadowQueryExists(page, "layout-section");
  expect(layoutSection).toBe(true);

  // Flex container sub-section should be visible
  const flexContainer = await shadowQueryExists(page, "layout-flex-container");
  expect(flexContainer).toBe(true);

  // Flex direction dropdown should be present and pre-selected to "row"
  const fdValue = await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const select = sr?.querySelector('[data-test="layout-select-flex-direction"]') as HTMLSelectElement | null;
    return select?.value ?? "";
  });
  expect(fdValue).toBe("row");

  // Change flex-direction to column
  await setSelect(page, "layout-select-flex-direction", "column");

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
      return log.includes("flex-direction");
    }, { timeout: 5000 })
    .toBe(true);
});

test("dev: layout section shows flex child controls when selecting a child of a flex container", async ({ page }) => {
  await page.goto("/");

  await page.click('[data-test="flex-child-a"]');
  await waitForEditors(page);

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

  // Top inset combo field should be present
  const hasTop = await shadowQueryExists(page, "layout-combo-select-top");
  expect(hasTop).toBe(true);

  // Change top from "0" (preset) to "auto"
  await setSelect(page, "layout-combo-select-top", "auto");

  // Managed stylesheet should have the rule
  await expect
    .poll(async () => (await sheetText(page)).includes("top: auto"), { timeout: 5000 })
    .toBe(true);

  // ChangesLog should show the edit
  await expect
    .poll(async () => {
      const log = await changesLogText(page);
      return log.includes("top");
    }, { timeout: 5000 })
    .toBe(true);
});
