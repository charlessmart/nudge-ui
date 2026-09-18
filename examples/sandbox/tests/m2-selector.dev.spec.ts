import { test, expect } from "@playwright/test";
import { appLocator, getAppFrame, openEditor } from "./editor.ts";

test("dev: hover overlay highlights and click selects a host element", async ({ page }) => {
  await openEditor(page, "/playground");
  await expect(appLocator(page, ".site-shell")).toBeVisible();

  const hasMount = await page.evaluate(() => {
    return document.getElementById("nudge-ui-root") !== null;
  });
  expect(hasMount).toBe(true);

  await appLocator(page, "button.btn").first().hover();

  await page.waitForTimeout(200);

  const hoverOutline = page.locator('[data-test="canvas-hover-outline"]');
  await expect(hoverOutline).toBeVisible();
  const hoverOverlay = await hoverOutline.boundingBox();
  expect(hoverOverlay).not.toBeNull();
  expect(hoverOverlay!.width).toBeGreaterThan(0);
  expect(hoverOverlay!.height).toBeGreaterThan(0);

  const selectionBefore = await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    return sr?.querySelector('[data-test="selection"]') ?? null;
  });
  expect(selectionBefore).toBeNull();

  await appLocator(page, "button.btn").first().click();

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
  await openEditor(page, "/playground");
  await expect(appLocator(page, ".site-shell")).toBeVisible();

  const buttonMetrics = await (await getAppFrame(page)).evaluate(() => {
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
  await openEditor(page, "/playground");
  await expect(appLocator(page, ".site-shell")).toBeVisible();
  const appFrame = await getAppFrame(page);

  const stylesheetCount = await appFrame.evaluate(() => document.styleSheets.length);
  await appFrame.evaluate(() => {
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
    await appLocator(page, "#hero-title").click();
    await expect(page.locator('[data-test="style-editors"]')).toBeVisible();
    await page.waitForTimeout(100);
  } finally {
    reads = await appFrame.evaluate(() => {
      const state = (window as Window & { __nudgeCssRuleReadState?: { reads: number } }).__nudgeCssRuleReadState;
      return state?.reads ?? 0;
    });
    await appFrame.evaluate(() => {
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
  await openEditor(page, "/playground");
  await expect(appLocator(page, ".site-shell")).toBeVisible();

  const button = appLocator(page, "button.btn").first();
  const label = button.locator(".btn__label");
  const buttonSrc = await button.getAttribute("data-src");
  const labelSrc = await label.getAttribute("data-src");
  if (!buttonSrc || !labelSrc) throw new Error("Expected source identities for the selection fixture");
  expect(labelSrc).not.toBe(buttonSrc);

  await label.click();
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();
  await expect(page.locator('[data-test="canvas-selected-outline"]')).toHaveAttribute("data-selected-src", buttonSrc);

  await label.click({ modifiers: ["Meta"] });
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();
  await expect(page.locator('[data-test="canvas-selected-outline"]')).toHaveAttribute("data-selected-src", labelSrc);
});

test("dev: hover overlay shows margin space while selection keeps only its outline", async ({ page }) => {
  await openEditor(page, "/playground");
  await expect(appLocator(page, ".site-shell")).toBeVisible();

  await appLocator(page, "#hero-title").hover();
  await page.waitForTimeout(100);

  const marginGuides = await page.evaluate(() => {
    const root = document.getElementById("nudge-ui-root");
    const shadow = root?.shadowRoot;
    const outline = shadow?.querySelector('[data-test="canvas-hover-outline"]')?.getBoundingClientRect();
    const guides = [...(shadow?.querySelectorAll(".canvas-hover-margin") ?? [])].map((node) => {
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
    const fills = [...(shadow?.querySelectorAll(".canvas-hover-margin-fill") ?? [])].map((node) => {
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

  await appLocator(page, "#hero-title").click();
  await expect(page.locator('[data-test="canvas-selected-outline"]')).toBeVisible();
  const selectedMarginOverlay = await page.evaluate(() => {
    const shadow = document.getElementById("nudge-ui-root")?.shadowRoot;
    const outline = shadow?.querySelector('[data-test="canvas-selected-outline"]') as HTMLElement | null;
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
