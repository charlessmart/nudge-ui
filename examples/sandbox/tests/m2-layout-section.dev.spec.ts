import { test, expect } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";

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

async function setLayoutInput(page: import("@playwright/test").Page, testId: string, value: string): Promise<void> {
  const input = page.locator(`[data-test="${testId}"] [data-test="raw-input"], [data-test="${testId}"] [data-test$="-input"]`).first();
  await expect(input).toBeVisible();
  await input.fill(value);
  await input.blur();
}

async function computedPropOn(page: import("@playwright/test").Page, testId: string, prop: string): Promise<string> {
  return await page.evaluate(({ t, p }) => {
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

/**
 * Selects a playground fixture via a synthetic click on the fixture element
 * itself (a positioned click can land on a tracked child instead). A click
 * issued while the playground tree or the inspector selection handler is
 * still mounting is silently dropped, so click and verify the selection
 * until it registers rather than firing once and racing bootstrap.
 */
async function selectFixture(page: import("@playwright/test").Page, testId: string): Promise<void> {
  await expect
    .poll(async () => {
      await page.evaluate((id) => {
        (document.querySelector(`[data-test="${id}"]`) as HTMLElement | null)?.click();
      }, testId);
      return shadowQueryExists(page, "layout-section");
    }, { timeout: 15000 })
    .toBe(true);
}

test("dev: layout section shows flex container controls and edits write to managed stylesheet", async ({ page }) => {
  await page.goto("/playground");

  await selectFixture(page, "flex-container");
  await waitForEditors(page);
  await expect.poll(async () => shadowQueryExists(page, "layout-flex-container"), { timeout: 5000 }).toBe(true);

  // Layout section should be visible
  const layoutSection = await shadowQueryExists(page, "layout-section");
  expect(layoutSection).toBe(true);

  const displaySelect = page.locator('[data-test="layout-select-display"]');
  await expect(displaySelect).toHaveAttribute("role", "combobox");
  await expect(displaySelect.locator(".select__icon")).toBeVisible();

  // Flex container sub-section should be visible
  const flexContainer = await shadowQueryExists(page, "layout-flex-container");
  expect(flexContainer).toBe(true);

  // The compact flex direction control should expose row as the active state.
  const rowDirectionActive = await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    const control = sr?.querySelector('[data-test="layout-direction-row"]');
    return control?.getAttribute("aria-pressed") === "true";
  });
  expect(rowDirectionActive).toBe(true);

  const initialGapProperties = await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    return Array.from(sr?.querySelectorAll('[data-test="layout-gap"] [data-test="layout-combo"]') ?? [])
      .map((field) => field.getAttribute("data-property"));
  });
  expect(initialGapProperties).toEqual(["column-gap"]);
  await expect(page.locator('[data-test="layout-gap"]')).not.toContainText("Spacing");
  await expect(page.locator('[data-test="layout-gap"]')).not.toContainText("Items");
  await expect(page.locator('[data-test="layout-gap"]')).not.toContainText("Distribution");

  const columnGapInput = page.locator('[data-test="layout-gap"] [data-test="layout-combo-input-column-gap"]');
  await expect(columnGapInput).toBeVisible();
  await expect(columnGapInput).toHaveCSS("height", "32px");
  const spacingFieldSurface = page.locator('[data-test="layout-gap"] .layout__spacing-primary .layout__spacing-field');
  await expect(spacingFieldSurface.locator('[data-test="layout-spacing-icon-column-gap"]')).toHaveCount(1);
  const surfaceColors = await spacingFieldSurface.evaluate((field) => ({
    field: getComputedStyle(field).backgroundColor,
    input: getComputedStyle(field.querySelector("input")!).backgroundColor,
  }));
  expect(surfaceColors.field).not.toBe("rgba(0, 0, 0, 0)");
  expect(surfaceColors.input).toBe("rgba(0, 0, 0, 0)");
  await expect(page.locator('[data-test="layout-gap"] [data-test="layout-combo-select-column-gap"]')).toHaveCount(0);
  await columnGapInput.fill("12");
  await columnGapInput.blur();
  await expect
    .poll(async () => (await sheetText(page)).includes("column-gap: 12px"), { timeout: 5000 })
    .toBe(true);

  const alignmentGridSize = await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    const grid = sr?.querySelector('[data-test^="layout-align-"]')?.parentElement;
    if (!grid) return null;
    const rect = grid.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  });
  expect(alignmentGridSize).not.toBeNull();
  expect(Math.abs((alignmentGridSize?.width ?? 0) - (alignmentGridSize?.height ?? 0))).toBeLessThan(2);

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
  await expect(page.locator('[data-test="layout-gap"]')).not.toContainText("Lines");
  await expect(page.locator('[data-test="layout-spacing-icon-column-gap"]')).toHaveCount(1);
  await expect(page.locator('[data-test="layout-spacing-icon-row-gap"]')).toHaveCount(1);

  // Change flex-direction to column.
  await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    (sr?.querySelector('[data-test="layout-direction-column"]') as HTMLButtonElement | null)?.click();
  });

  // Computed style should update
  await expect
    .poll(async () => computedPropOn(page, "flex-container", "flex-direction"), { timeout: 5000 })
    .toBe("column");
  await expect(page.locator('.layout__spacing-primary [data-test="layout-spacing-icon-row-gap"]')).toHaveCount(1);

  // In a column layout, the grid's top-right cell means top + right:
  // justify-content: flex-start and align-items: flex-end.
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

  // Lower-frequency flex settings live behind the settings icon.
  await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    (sr?.querySelector('[data-test="layout-flex-settings"]') as HTMLButtonElement | null)?.click();
  });
  await expect.poll(async () => page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    return !!sr?.querySelector('[data-test="layout-flex-setting-align-content-center"]');
  }), { timeout: 5000 }).toBe(true);
  await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    (sr?.querySelector('[data-test="layout-flex-settings"]') as HTMLButtonElement | null)?.click();
  });
  await page.locator('[data-test="layout-flex-distribution"]').click();
  await page.locator('[data-test="layout-flex-distribution-space-between"]').click();
  await expect
    .poll(async () => computedPropOn(page, "flex-container", "justify-content"), { timeout: 5000 })
    .toBe("space-between");
  await expect(page.locator('[data-test="layout-flex-distribution"]')).toHaveAttribute("data-active", "true");
  await expect.poll(async () => page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    return !!sr?.querySelector(".layout__distribution-preview");
  }), { timeout: 5000 }).toBe(true);

  const betweenMarkers = await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    return Array.from(sr?.querySelectorAll(".layout__distribution-preview span") ?? []).map((marker) => ({
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
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    return Array.from(sr?.querySelectorAll(".layout__distribution-preview span") ?? [])
      .map((marker) => marker.getBoundingClientRect().top);
  });
  expect(aroundMarkers[0]!).toBeGreaterThan(betweenMarkers[0]!.top);
  expect(aroundMarkers[2]!).toBeLessThan(betweenMarkers[2]!.top);

  await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    (sr?.querySelector('[data-test="layout-flex-settings"]') as HTMLButtonElement | null)?.click();
  });
  await expect.poll(async () => page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    return !!sr?.querySelector('[data-test="layout-flex-setting-align-items-stretch"]');
  }), { timeout: 5000 }).toBe(true);
  await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    (sr?.querySelector('[data-test="layout-flex-setting-align-items-stretch"]') as HTMLElement | null)?.click();
  });
  await expect
    .poll(async () => computedPropOn(page, "flex-container", "align-items"), { timeout: 5000 })
    .toBe("stretch");

  await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    (sr?.querySelector('[data-test="layout-flex-settings"]') as HTMLButtonElement | null)?.click();
  });
  await expect.poll(async () => page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    return !!sr?.querySelector('[data-test="layout-flex-setting-align-content-center"]');
  }), { timeout: 5000 }).toBe(true);
  await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
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
  await page.goto("/playground");

  await page.click('[data-test="flex-child-a"]');
  await waitForEditors(page);
  await expect.poll(async () => shadowQueryExists(page, "layout-flex-child"), { timeout: 5000 }).toBe(true);

  // Layout section should be visible
  expect(await shadowQueryExists(page, "layout-section")).toBe(true);

  // Flex child sub-section should be visible (parent is flex)
  expect(await shadowQueryExists(page, "layout-flex-child")).toBe(true);

  // Flex child properties should be present
  const hasFlexChildSettings = await shadowQueryExists(page, "layout-flex-child-settings");
  expect(hasFlexChildSettings).toBe(true);

  // Frequently used flex child fields are direct text inputs.
  const hasFlexGrow = await shadowQueryExists(page, "layout-combo-input-flex-grow");
  expect(hasFlexGrow).toBe(true);
  await expect(page.locator('[data-test="layout-combo-input-flex-grow"]')).toHaveCSS("height", "32px");
  await expect(page.locator('[data-test="layout-combo-input-flex-shrink"]')).toHaveCSS("height", "32px");
  await expect(page.locator('[data-test="layout-combo-input-flex-basis"]')).toHaveCSS("height", "32px");

  await page.locator('[data-test="layout-flex-child-settings"]').click();
  await expect(page.locator('[data-test="layout-select-align-self"]')).toBeVisible();
  await expect(page.locator('[data-test="layout-combo-select-order"]')).toBeVisible();
  await expect(page.locator('[data-test="layout-combo-select-order"]')).toHaveCSS("height", "32px");

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

  await page.mouse.move(0, 0);

  // Change flex-grow to 2
  const flexGrowInput = page.locator('[data-test="layout-combo-input-flex-grow"]');
  await flexGrowInput.fill("2");
  await flexGrowInput.blur();

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
  await page.goto("/playground");

  await page.click('[data-test="positioned-box"]');
  await waitForEditors(page);

  // Layout section should be visible
  expect(await shadowQueryExists(page, "layout-section")).toBe(true);

  // Inset sub-section should be visible (position is relative)
  expect(await shadowQueryExists(page, "layout-inset")).toBe(true);
  const editorOrder = await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    return Array.from(sr?.querySelectorAll<HTMLElement>('[data-test="style-editors"] > .editor') ?? [])
      .map((editor) => editor.getAttribute("data-test"));
  });
  expect(editorOrder).toContain("spacing-box");
  expect(await shadowQueryExists(page, "layout-inset")).toBe(true);
  expect(await page.locator('[data-test="spacing-box"] [data-test="layout-inset"]').count()).toBe(1);

  // Empty relative insets stay compact until explicitly added.
  await expect(page.locator('[data-test="add-inset"]')).toBeVisible();
  await page.locator('[data-test="add-inset"]').click();

  // Inset starts with the same grouped horizontal/vertical controls as padding and margin.
  await expect(page.locator('[data-test="layout-inset"] [data-test="pair-value-horizontal"]')).toBeVisible();
  await expect(page.locator('[data-test="layout-inset"] [data-test="pair-value-vertical"]')).toBeVisible();
  await page.locator('[data-test="layout-inset"] [data-test="individual-sides"]').click();

  // Expanded inset sides use the regular token/raw input.
  await expect(page.locator('[data-test="token-field"][data-property="top"] [data-test="raw-input"]')).toBeVisible();
  expect(await shadowQueryExists(page, "layout-combo-select-top")).toBe(false);
  const topInsetIcon = await page.evaluate(() => {
    const shadow = document.getElementById("nudge-ui-root")?.shadowRoot;
    const svg = shadow?.querySelector('[data-test="layout-inset"] [data-side="top"] svg') as SVGSVGElement | null;
    const rect = svg?.querySelector("rect");
    return {
      width: svg ? getComputedStyle(svg).width : "",
      height: svg ? getComputedStyle(svg).height : "",
      color: svg ? getComputedStyle(svg).color : "",
      rectX: rect?.getAttribute("x"),
      rectTransform: rect?.getAttribute("transform"),
      stroke: rect?.getAttribute("stroke"),
    };
  });
  expect(topInsetIcon).toMatchObject({
    width: "16px",
    height: "16px",
    color: "rgb(111, 111, 111)",
    rectX: "19",
    rectTransform: "rotate(90 19 7)",
    stroke: "currentColor",
  });

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
  await page.goto("/playground");
  await page.click('[data-test="positioned-box"]');
  await waitForEditors(page);

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

test("dev: layout size controls edit dimensions and aspect ratio", async ({ page }) => {
  await page.goto("/playground");
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
  await page.goto("/playground");
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
  await page.goto("/playground");
  await page.click('[data-test="stretched-box"]');
  await waitForEditors(page);

  await expect(page.locator('[data-test="layout-anchor-horizontal-stretch"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-test="layout-position-x"]')).toHaveCount(0);
  await expect(page.locator('[data-test="layout-position-x-left"]')).toBeVisible();
  await expect(page.locator('[data-test="layout-position-x-right"]')).toBeVisible();
});

test("dev: Grid controls preserve authored track expressions and edit managed rules", async ({ page }) => {
  await page.goto("/playground");
  await page.click('[data-test="grid-authored-container"]');
  await waitForEditors(page);

  await expect(page.locator('[data-test="layout-grid-container"]')).toBeVisible({ timeout: 10000 });
  const gridGap = page.locator('[data-test="layout-grid-gap"]');
  await expect(gridGap.locator('.layout__spacing-field')).toHaveCount(2);
  for (const property of ["row-gap", "column-gap"]) {
    const surface = gridGap.locator(`[data-test="layout-grid-${property}"]`);
    await expect(surface).toHaveClass(/layout__spacing-field/);
    await expect(surface).toHaveCSS("height", "32px");
    await expect(surface.locator(`[data-test="layout-spacing-icon-${property}"]`)).toHaveCount(1);
    const input = surface.locator(`[data-test="layout-combo-input-${property}"]`);
    await expect(input).toHaveCSS("height", "32px");
    await expect(input).not.toHaveClass(/text-input--compact/);
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

  await page.locator('[data-test="layout-grid-settings"]').click();
  await expect(page.locator('[data-test="layout-grid-settings-popover"] [data-test="layout-grid-advanced"]')).toBeVisible();
  const columns = page.locator('[data-test="layout-grid-input-grid-template-columns"]');
  await expect(columns).toHaveValue(/repeat\(3, minmax\(0(?:px)?, 1fr\)\)/);
  await expect(page.locator('[data-test="layout-grid-input-grid-template-rows"]'))
    .toHaveValue(/repeat\(2, minmax\(0(?:px)?, 1fr\)\)/);

  await columns.fill("repeat(4, minmax(0, 1fr))");
  await columns.blur();
  await expect.poll(async () => sheetText(page), { timeout: 5000 })
    .toMatch(/grid-template-columns: repeat\(4, minmax\(0(?:px)?, 1fr\)\)/);
  await page.keyboard.press("Escape");

  await page.click('[data-test="grid-child-span"]');
  await waitForEditors(page);
  await expect(page.locator('[data-test="layout-grid-child"]')).toBeVisible();

  const startSelect = page.locator('[data-test="layout-grid-child-column-start"]');
  await expect(startSelect).toContainText("2");
  await expect(page.locator('[data-test="layout-grid-child-column-span-value"]')).toHaveValue("2");

  await startSelect.click();
  await page.locator('.select__item:visible[data-value="1"]').click();
  await expect.poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("grid-column-start: 1;");

  await page.locator('[data-test="layout-grid-child-column-span-increment"]').click();
  await expect.poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("grid-column-end: span 3;");
  await expect.poll(async () => computedPropOn(page, "grid-child-span", "grid-column"), { timeout: 5000 })
    .toContain("1 / span 3");

  await page.locator('[data-test="layout-grid-child-action-full-width"]').click();
  await expect(page.locator('[data-test="layout-grid-child-action-full-width"]')).toHaveAttribute("data-active", "true");
  await expect.poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("grid-column: 1 / -1;");
  await expect.poll(async () => computedPropOn(page, "grid-child-span", "grid-column"), { timeout: 5000 })
    .toContain("1 / -1");

  await page.locator('[data-test="layout-grid-child-select-justify-self"]').click();
  await page.locator('.select__item:visible[data-value="center"]').click();
  await expect.poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("justify-self: center;");
  await expect.poll(async () => computedPropOn(page, "grid-child-span", "justify-self"), { timeout: 5000 })
    .toContain("center");
});

test("dev: Grid is selectable from the Layout display dropdown", async ({ page }) => {
  await page.goto("/playground");
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
