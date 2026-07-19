import { test, expect } from "@playwright/test";

test("dev: hover overlay highlights and click selects a host element", async ({ page }) => {
  await page.goto("/");

  const hasMount = await page.evaluate(() => {
    return document.getElementById("design-tool-root") !== null;
  });
  expect(hasMount).toBe(true);

  await page.hover("text=Save");

  await page.waitForTimeout(200);

  const hoverOverlay = await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const outline = sr?.querySelector(".dt-hover-outline") ?? null;
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
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    return sr?.querySelector('[data-test="selection"]') ?? null;
  });
  expect(selectionBefore).toBeNull();

  await page.click("text=Save");

  const panelText = await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    return sr?.textContent ?? "";
  });
  expect(panelText).not.toContain("Button.tsx");

  const hasSelection = await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const labels = [...(sr?.querySelectorAll(".dt-field-row__label, .dt-side-values__label, .dt-editor__title, .dt-layout__group-title") ?? [])]
      .map((node) => node.textContent?.trim() ?? "");
    return {
      hasSelection: sr?.querySelector('[data-test="selection"]') !== null,
      hasBreadcrumb: sr?.querySelector(".dt-breadcrumb") !== null,
      hasMetadataRows: sr?.querySelectorAll(".dt-selection__row").length ?? 0,
      hasStateControls: sr?.querySelector('[data-test="style-state"]') !== null,
      labels,
    };
  });
  expect(hasSelection.hasSelection).toBe(true);
  expect(hasSelection.hasBreadcrumb).toBe(false);
  expect(hasSelection.hasMetadataRows).toBe(0);
  expect(hasSelection.hasStateControls).toBe(false);
  expect(hasSelection.labels).toEqual(expect.arrayContaining([
    "Layout",
    "Spacing",
    "Typography",
    "Font Size",
    "Font Weight",
    "Line Height",
    "Letter Spacing",
    "Font Family",
  ]));
  expect(hasSelection.labels.every((label) => !/[a-z]-[a-z]/.test(label))).toBe(true);

  await page.evaluate(() => {
    document.body.click();
  });

  const stillSelected = await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const sel = sr?.querySelector('[data-test="selection"]');
    if (!sel) return null;
    return sel.textContent ?? "";
  });
  expect(stillSelected).not.toContain("Button.tsx");
});

test("dev: hover overlay shows margin space while selection keeps only its outline", async ({ page }) => {
  await page.goto("/");

  await page.locator("#hero-title").hover();
  await page.waitForTimeout(100);

  const marginGuides = await page.evaluate(() => {
    const root = document.getElementById("design-tool-root");
    const shadow = root?.shadowRoot;
    const outline = shadow?.querySelector(".dt-hover-outline")?.getBoundingClientRect();
    const guides = [...(shadow?.querySelectorAll(".dt-hover-margin") ?? [])].map((node) => {
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
    const fills = [...(shadow?.querySelectorAll(".dt-hover-margin-fill") ?? [])].map((node) => {
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
    const shadow = document.getElementById("design-tool-root")?.shadowRoot;
    const outline = shadow?.querySelector(".dt-selected-outline") as HTMLElement | null;
    return {
      fills: shadow?.querySelectorAll(".dt-selected-margin-fill").length ?? 0,
      guides: shadow?.querySelectorAll(".dt-selected-margin").length ?? 0,
      outline: outline !== null,
      outlineColor: outline ? getComputedStyle(outline).outlineColor : null,
    };
  });
  expect(selectedMarginOverlay).toEqual({
    fills: 0,
    guides: 0,
    outline: true,
    outlineColor: "rgb(59, 130, 246)",
  });
});
