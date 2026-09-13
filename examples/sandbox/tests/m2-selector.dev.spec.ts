import { test, expect } from "@playwright/test";

test("dev: hover overlay highlights and click selects a host element", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator(".site-shell")).toBeVisible();

  const hasMount = await page.evaluate(() => {
    return document.getElementById("nudge-ui-root") !== null;
  });
  expect(hasMount).toBe(true);

  await page.hover("text=Save");

  await page.waitForTimeout(200);

  const hoverOverlay = await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    const outline = sr?.querySelector(".hover-outline") ?? null;
    if (!outline) return null;
    const rect = outline.getBoundingClientRect();
    const style = (outline as HTMLElement).style;
    return {
      display: style.display || "",
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
    };
  });
  expect(hoverOverlay).not.toBeNull();
  expect(hoverOverlay!.width).toBeGreaterThan(0);
  expect(hoverOverlay!.height).toBeGreaterThan(0);

  const selectionBefore = await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    return sr?.querySelector('[data-test="selection"]') ?? null;
  });
  expect(selectionBefore).toBeNull();

  await page.click("text=Save");

  const panelText = await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    return sr?.textContent ?? "";
  });
  expect(panelText).not.toContain("Button.tsx");

  const hasSelection = await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    const labels = [...(sr?.querySelectorAll(".field-row__label, .side-values__label, .editor__title") ?? [])]
      .map((node) => node.textContent?.trim() ?? "");
    return {
      hasStyleEditors: sr?.querySelector('[data-test="style-editors"]') !== null,
      hasMetadataRows: sr?.querySelectorAll(".selection__row").length ?? 0,
      hasStateControls: sr?.querySelector('[data-test="style-state"]') !== null,
      legacyGroupTitleCount: sr?.querySelectorAll(".layout__group-title").length ?? 0,
      labels,
    };
  });
  expect(hasSelection.hasStyleEditors).toBe(true);
  expect(hasSelection.hasMetadataRows).toBe(0);
  expect(hasSelection.hasStateControls).toBe(false);
  expect(hasSelection.legacyGroupTitleCount).toBe(0);
  expect(hasSelection.labels).toEqual(expect.arrayContaining(["Layout", "Display", "Position"]));
  expect(hasSelection.labels.every((label) => !/[a-z]-[a-z]/.test(label))).toBe(true);

});

test("dev: primary demo button sizes to its label", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator(".site-shell")).toBeVisible();

  const buttonMetrics = await page.evaluate(() => {
    const button = document.querySelector("button.btn");
    const label = button?.querySelector<HTMLElement>(".btn__label");
    if (!button || !label) return null;
    const buttonRect = button.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    return {
      buttonWidth: buttonRect.width,
      labelWidth: labelRect.width,
      labelPosition: getComputedStyle(label).position,
    };
  });

  expect(buttonMetrics).not.toBeNull();
  expect(buttonMetrics!.buttonWidth).toBeGreaterThan(buttonMetrics!.labelWidth);
  expect(buttonMetrics!.labelPosition).toBe("static");
});

test("dev: selection shares one stylesheet snapshot across inspector fields", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator(".site-shell")).toBeVisible();

  const stylesheetCount = await page.evaluate(() => document.styleSheets.length);
  await page.evaluate(() => {
    const descriptor = Object.getOwnPropertyDescriptor(CSSStyleSheet.prototype, "cssRules");
    if (!descriptor?.get) throw new Error("CSSStyleSheet.cssRules getter is unavailable");
    const state = { reads: 0, descriptor };
    Object.defineProperty(CSSStyleSheet.prototype, "cssRules", {
      configurable: true,
      get() {
        state.reads++;
        return descriptor.get!.call(this);
      },
    });
    (window as Window & { __nudgeCssRuleReadState?: typeof state }).__nudgeCssRuleReadState = state;
  });

  let reads = 0;
  try {
    await page.locator("#hero-title").click();
    await expect(page.locator('[data-test="style-editors"]')).toBeVisible();
    await page.waitForTimeout(100);
  } finally {
    reads = await page.evaluate(() => {
      const state = (window as Window & { __nudgeCssRuleReadState?: { reads: number } }).__nudgeCssRuleReadState;
      return state?.reads ?? 0;
    });
    await page.evaluate(() => {
      const state = (window as Window & { __nudgeCssRuleReadState?: { reads: number; descriptor: PropertyDescriptor } }).__nudgeCssRuleReadState;
      if (!state) return;
      Object.defineProperty(CSSStyleSheet.prototype, "cssRules", state.descriptor);
      (window as Window & { __nudgeCssRuleReadState?: unknown }).__nudgeCssRuleReadState = undefined;
    });
  }

  /*
   * A selection should walk each sheet once, not rewalk all sheets for each
   * editor field. The inspector may add a runtime stylesheet after selection,
   * so allow a small buffer beyond the pre-selection stylesheet count.
   */
  expect(reads).toBeLessThanOrEqual(stylesheetCount + 3);
});

test("dev: ordinary clicks choose a button wrapper and Command-click chooses its child", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator(".site-shell")).toBeVisible();

  const button = page.locator("button.btn").first();
  const label = button.locator(".btn__label");
  const buttonSrc = await button.getAttribute("data-src");
  const labelSrc = await label.getAttribute("data-src");
  expect(buttonSrc).toBeTruthy();
  expect(labelSrc).toBeTruthy();
  expect(labelSrc).not.toBe(buttonSrc);

  await label.click();
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();
  const wrapperOutline = await page.locator('[data-test="selected-outline"]').boundingBox();
  const buttonBox = await button.boundingBox();
  if (!wrapperOutline || !buttonBox) throw new Error("Expected host selection geometry");
  expect(Math.abs(wrapperOutline.width - buttonBox.width)).toBeLessThan(2);
  expect(Math.abs(wrapperOutline.height - buttonBox.height)).toBeLessThan(2);

  await label.click({ modifiers: ["Meta"] });
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();
  await expect.poll(async () => {
    const childOutline = await page.locator('[data-test="selected-outline"]').boundingBox();
    const labelBox = await label.boundingBox();
    return Boolean(childOutline && labelBox
      && Math.abs(childOutline.width - labelBox.width) < 2
      && Math.abs(childOutline.height - labelBox.height) < 2);
  }).toBe(true);
});

test("dev: hover overlay shows margin space while selection keeps only its outline", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator(".site-shell")).toBeVisible();

  await page.locator("#hero-title").hover();
  await page.waitForTimeout(100);

  const marginGuides = await page.evaluate(() => {
    const root = document.getElementById("nudge-ui-root");
    const shadow = root?.shadowRoot;
    const outline = shadow?.querySelector(".hover-outline")?.getBoundingClientRect();
    const guides = [...(shadow?.querySelectorAll(".hover-margin") ?? [])].map((node) => {
      const guide = node as HTMLElement;
      const rect = guide.getBoundingClientRect();
      const style = getComputedStyle(guide);
      return {
        axis: guide.dataset.axis,
        distance: Number(guide.dataset.distance),
        side: guide.dataset.side,
        dotted: style.borderTopStyle === "dotted" || style.borderLeftStyle === "dotted",
        opacity: Number(style.opacity),
        offset: guide.dataset.axis === "horizontal"
          ? Math.abs(rect.top - (outline?.top ?? 0))
          : Math.abs(rect.left - (outline?.left ?? 0)),
      };
    });
    const fills = [...(shadow?.querySelectorAll(".hover-margin-fill") ?? [])].map((node) => {
      const fill = node as HTMLElement;
      const rect = fill.getBoundingClientRect();
      return { side: fill.dataset.side, width: rect.width, height: rect.height };
    });
    return { fills, guides, outline };
  });

  expect(marginGuides.outline).not.toBeNull();
  expect(marginGuides.guides).toEqual(expect.arrayContaining([
    expect.objectContaining({ side: "top", axis: "horizontal", distance: 26, dotted: true }),
    expect.objectContaining({ side: "bottom", axis: "horizontal", distance: 22, dotted: true }),
  ]));
  expect(marginGuides.guides.every((guide) => guide.opacity < 1)).toBe(true);
  expect(marginGuides.guides.find((guide) => guide.side === "top")?.offset).toBeCloseTo(26, 0);
  expect(marginGuides.fills).toEqual(expect.arrayContaining([
    expect.objectContaining({ side: "top", height: 26 }),
    expect.objectContaining({ side: "bottom", height: 22 }),
  ]));

  await page.locator("#hero-title").click();
  const selectedMarginOverlay = await page.evaluate(() => {
    const shadow = document.getElementById("nudge-ui-root")?.shadowRoot;
    const outline = shadow?.querySelector(".selected-outline") as HTMLElement | null;
    return {
      fills: shadow?.querySelectorAll(".selected-margin-fill").length ?? 0,
      guides: shadow?.querySelectorAll(".selected-margin").length ?? 0,
      outline: outline !== null,
    };
  });
  expect(selectedMarginOverlay).toEqual({
    fills: 0,
    guides: 0,
    outline: true,
  });
});
