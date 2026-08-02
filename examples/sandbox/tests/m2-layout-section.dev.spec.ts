import { test, expect } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";

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
  return managedSheetText(page);
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

async function setLayoutInput(page: import("@playwright/test").Page, testId: string, value: string): Promise<void> {
  const input = page.locator(`[data-test="${testId}"] [data-test="raw-input"], [data-test="${testId}"] [data-test$="-input"]`).first();
  await expect(input).toBeVisible();
  await input.fill(value);
  await input.blur();
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
  await page.locator('[data-test="changes-toggle"]').click();
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

  const initialGapProperties = await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    return Array.from(sr?.querySelectorAll('[data-test="layout-gap"] [data-test="layout-combo"]') ?? [])
      .map((field) => field.getAttribute("data-property"));
  });
  expect(initialGapProperties).toEqual(["column-gap"]);
  await expect(page.locator('[data-test="layout-gap"]')).toContainText("Spacing");
  await expect(page.locator('[data-test="layout-gap"]')).not.toContainText("Items");
  await expect(page.locator('[data-test="layout-gap"]')).not.toContainText("Distribution");

  const columnGapInput = page.locator('[data-test="layout-gap"] [data-test="layout-combo-input-column-gap"]');
  await expect(columnGapInput).toBeVisible();
  await expect(page.locator('[data-test="layout-gap"] [data-test="layout-combo-select-column-gap"]')).toHaveCount(0);
  await columnGapInput.fill("12");
  await columnGapInput.blur();
  await expect
    .poll(async () => (await sheetText(page)).includes("column-gap: 12px"), { timeout: 5000 })
    .toBe(true);

  const alignmentGridSize = await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const grid = sr?.querySelector('[data-test^="layout-align-"]')?.parentElement;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(alignmentGridSize).not.toBeNull();
  expect(Math.abs((alignmentGridSize?.width ?? 0) - (alignmentGridSize?.height ?? 0))).toBeLessThan(2);

  await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    (sr?.querySelector('[data-test="layout-flex-wrap-toggle"]') as HTMLButtonElement | null)?.click();
  });
  await expect
    .poll(async () => computedPropOn(page, "flex-container", "flex-wrap"), { timeout: 5000 })
    .toBe("wrap");
  await expect.poll(async () => page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    return Array.from(sr?.querySelectorAll('[data-test="layout-gap"] [data-test="layout-combo"]') ?? [])
      .map((field) => field.getAttribute("data-property"))
      .sort();
  }), { timeout: 5000 }).toEqual(["column-gap", "row-gap"]);
  await expect(page.locator('[data-test="layout-gap"]')).toContainText("Lines");

  // Change flex-direction to column.
  await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    (sr?.querySelector('[data-test="layout-direction-column"]') as HTMLButtonElement | null)?.click();
  });

  // Computed style should update
  await expect
    .poll(async () => computedPropOn(page, "flex-container", "flex-direction"), { timeout: 5000 })
    .toBe("column");

  // In a column layout, the grid's top-right cell means top + right:
  // justify-content: flex-start and align-items: flex-end.
  await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    (sr?.querySelector('[data-test="layout-align-flex-end-flex-start"]') as HTMLButtonElement | null)?.click();
  });
  await expect
    .poll(async () => computedPropOn(page, "flex-container", "justify-content"), { timeout: 5000 })
    .toBe("flex-start");
  await expect
    .poll(async () => computedPropOn(page, "flex-container", "align-items"), { timeout: 5000 })
    .toBe("flex-end");

  // Lower-frequency flex settings live behind the settings icon.
  await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    (sr?.querySelector('[data-test="layout-flex-settings"]') as HTMLButtonElement | null)?.click();
  });
  await expect.poll(async () => page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    return !!sr?.querySelector('[data-test="layout-flex-setting-align-content-center"]');
  }), { timeout: 5000 }).toBe(true);
  await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    (sr?.querySelector('[data-test="layout-flex-settings"]') as HTMLButtonElement | null)?.click();
  });
  await page.locator('[data-test="layout-flex-distribution"]').click();
  await page.locator('[data-test="layout-flex-distribution-space-between"]').click();
  await expect
    .poll(async () => computedPropOn(page, "flex-container", "justify-content"), { timeout: 5000 })
    .toBe("space-between");
  await expect.poll(async () => page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    return !!sr?.querySelector(".dt-layout__distribution-preview");
  }), { timeout: 5000 }).toBe(true);

  const betweenMarkers = await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    return Array.from(sr?.querySelectorAll(".dt-layout__distribution-preview span") ?? []).map((marker) => ({
      top: marker.getBoundingClientRect().top,
      shadow: getComputedStyle(marker).boxShadow,
    }));
  });
  expect(betweenMarkers).toHaveLength(3);
  expect(betweenMarkers.every((marker) => marker.shadow === "none")).toBe(true);

  await page.locator('[data-test="layout-flex-distribution"]').click();
  await page.locator('[data-test="layout-flex-distribution-space-around"]').click();
  await expect
    .poll(async () => computedPropOn(page, "flex-container", "justify-content"), { timeout: 5000 })
    .toBe("space-around");
  const aroundMarkers = await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    return Array.from(sr?.querySelectorAll(".dt-layout__distribution-preview span") ?? [])
      .map((marker) => marker.getBoundingClientRect().top);
  });
  expect(aroundMarkers[0]!).toBeGreaterThan(betweenMarkers[0]!.top);
  expect(aroundMarkers[2]!).toBeLessThan(betweenMarkers[2]!.top);

  await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    (sr?.querySelector('[data-test="layout-flex-settings"]') as HTMLButtonElement | null)?.click();
  });
  await expect.poll(async () => page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    return !!sr?.querySelector('[data-test="layout-flex-setting-align-items-stretch"]');
  }), { timeout: 5000 }).toBe(true);
  await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    (sr?.querySelector('[data-test="layout-flex-setting-align-items-stretch"]') as HTMLElement | null)?.click();
  });
  await expect
    .poll(async () => computedPropOn(page, "flex-container", "align-items"), { timeout: 5000 })
    .toBe("stretch");

  await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    (sr?.querySelector('[data-test="layout-flex-settings"]') as HTMLButtonElement | null)?.click();
  });
  await expect.poll(async () => page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    return !!sr?.querySelector('[data-test="layout-flex-setting-align-content-center"]');
  }), { timeout: 5000 }).toBe(true);
  await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    (sr?.querySelector('[data-test="layout-flex-setting-align-content-center"]') as HTMLElement | null)?.click();
  });
  await expect
    .poll(async () => computedPropOn(page, "flex-container", "align-content"), { timeout: 5000 })
    .toBe("center");

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

test("dev: layout size controls edit dimensions and aspect ratio", async ({ page }) => {
  await page.goto("/");
  await page.click('[data-test="sizing-box"]');
  await waitForEditors(page);

  await expect(page.locator('[data-test="layout-size"]')).toBeVisible();
  await setLayoutInput(page, "layout-size-width", "240");

  await page.locator('[data-test="layout-size-expand"]').click();
  await setLayoutInput(page, "layout-size-max-height", "40vh");

  const ratioInput = page.locator('[data-test="layout-aspect-ratio-input"]');
  await ratioInput.fill("16 / 9");
  await ratioInput.blur();

  await expect.poll(async () => computedPropOn(page, "sizing-box", "width"), { timeout: 5000 }).toBe("240px");
  await expect.poll(async () => computedPropOn(page, "sizing-box", "max-height"), { timeout: 5000 }).toMatch(/px$/);
  await expect.poll(async () => sheetText(page), { timeout: 5000 }).toContain("max-height: 40vh");
  await expect.poll(async () => computedPropOn(page, "sizing-box", "aspect-ratio"), { timeout: 5000 }).toContain("16 / 9");
  await expect.poll(async () => sheetText(page), { timeout: 5000 }).toContain("width: 240px");
  await expect.poll(async () => sheetText(page), { timeout: 5000 }).toContain("aspect-ratio: 16 / 9");
});

test("dev: absolute position controls route X and Y to their anchors", async ({ page }) => {
  await page.goto("/");
  await page.click('[data-test="right-anchored-box"]');
  await waitForEditors(page);

  await expect(page.locator('[data-test="layout-position"]')).toBeVisible();
  await expect(page.locator('[data-test="layout-anchor-horizontal-end"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-test="layout-anchor-vertical-end"]')).toHaveAttribute("aria-pressed", "true");

  await setLayoutInput(page, "layout-position-x", "32");
  await setLayoutInput(page, "layout-position-y", "18");
  await expect.poll(async () => computedPropOn(page, "right-anchored-box", "right"), { timeout: 5000 }).toBe("32px");
  await expect.poll(async () => computedPropOn(page, "right-anchored-box", "bottom"), { timeout: 5000 }).toBe("18px");

  await page.locator('[data-test="layout-anchor-horizontal-start"]').click();
  await expect.poll(async () => sheetText(page), { timeout: 5000 }).toContain("left: 32px");
  await expect.poll(async () => sheetText(page), { timeout: 5000 }).toContain("right: auto");

  await page.keyboard.press("Control+z");
  await expect.poll(async () => sheetText(page), { timeout: 5000 }).not.toContain("left: 32px");
  await expect.poll(async () => computedPropOn(page, "right-anchored-box", "right"), { timeout: 5000 }).toBe("32px");
});

test("dev: stretched absolute positioning exposes both axis insets", async ({ page }) => {
  await page.goto("/");
  await page.click('[data-test="stretched-box"]');
  await waitForEditors(page);

  await expect(page.locator('[data-test="layout-anchor-horizontal-stretch"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-test="layout-position-x"]')).toHaveCount(0);
  await expect(page.locator('[data-test="layout-position-x-left"]')).toBeVisible();
  await expect(page.locator('[data-test="layout-position-x-right"]')).toBeVisible();
});

test("dev: Grid controls preserve authored track expressions and edit managed rules", async ({ page }) => {
  await page.goto("/");
  await page.click('[data-test="grid-authored-container"]');
  await waitForEditors(page);

  await expect(page.locator('[data-test="layout-grid-container"]')).toBeVisible();
  const picker = page.locator('[data-test="layout-grid-picker-trigger"]');
  await expect(picker).toBeVisible();
  await picker.click();
  await expect(page.locator('[data-test="layout-grid-picker-popover"]')).toBeVisible();
  await page.locator('[data-test="layout-grid-cell-3-2"]').click();
  await expect.poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
  await expect.poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("grid-template-rows: repeat(2, minmax(0, 1fr))");

  await page.locator('[data-test="layout-grid-advanced"] summary').click();
  const columns = page.locator('[data-test="layout-grid-input-grid-template-columns"]');
  await expect(columns).toHaveValue(/repeat\(3, minmax\(0(?:px)?, 1fr\)\)/);
  await expect(page.locator('[data-test="layout-grid-input-grid-template-rows"]'))
    .toHaveValue(/repeat\(2, minmax\(0(?:px)?, 1fr\)\)/);

  await columns.fill("repeat(4, minmax(0, 1fr))");
  await columns.blur();
  await expect.poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("grid-template-columns: repeat(4, minmax(0, 1fr))");

  await page.click('[data-test="grid-child-span"]');
  await waitForEditors(page);
  await expect(page.locator('[data-test="layout-grid-child"]')).toBeVisible();
  const childColumn = page.locator('[data-test="layout-grid-input-grid-column"]');
  await expect(childColumn).toHaveValue("2 / span 2");
  await childColumn.fill("1 / span 3");
  await childColumn.blur();
  await expect.poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("grid-column: 1 / span 3");
  await expect.poll(async () => computedPropOn(page, "grid-child-span", "grid-column"), { timeout: 5000 })
    .toContain("1 / span 3");
});

test("dev: Grid is selectable from the Layout display dropdown", async ({ page }) => {
  await page.goto("/");
  await page.click('[data-test="grid-switch-target"]');
  await waitForEditors(page);
  await expect(page.locator('[data-test="layout-grid-container"]')).toHaveCount(0);

  await setSelect(page, "layout-select-display", "grid");
  await expect(page.locator('[data-test="layout-grid-container"]')).toBeVisible();
  await expect.poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("display: grid");
  await expect.poll(async () => computedPropOn(page, "grid-switch-target", "display"), { timeout: 5000 })
    .toBe("grid");
});
