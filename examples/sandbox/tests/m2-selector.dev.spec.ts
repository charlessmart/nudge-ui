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
  expect(panelText).toContain("Button");
  expect(panelText).toContain("Button.tsx");

  const hasSelection = await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    return sr?.querySelector('[data-test="selection"]') !== null;
  });
  expect(hasSelection).toBe(true);

  await page.evaluate(() => {
    document.body.click();
  });

  const stillSelected = await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const sel = sr?.querySelector('[data-test="selection"]');
    if (!sel) return null;
    return sel.textContent ?? "";
  });
  expect(stillSelected).toContain("Button");
});