import { expect, test } from "@playwright/test";

test("Tailwind v3 owns its PostCSS stylesheet graph and catalog", async ({ page }) => {
  await page.goto("/examples");
  const facts = await page.evaluate(() => ({
    css: Array.from(document.styleSheets).flatMap((sheet) => {
      try { return Array.from(sheet.cssRules).map((rule) => rule.cssText); } catch { return []; }
    }).join("\n"),
    catalog: (window as unknown as { __designTokenCatalog?: Array<{ name: string; adapter?: string }> }).__designTokenCatalog ?? [],
  }));
  expect(facts.css).toContain(".bg-brand");
  expect(facts.catalog.some((entry) => entry.name === "theme.colors.brand" && entry.adapter === "tailwind-v3")).toBe(true);
  expect(facts.catalog.some((entry) => entry.adapter === "tailwind-v4" || entry.adapter === "vanilla-extract")).toBe(false);
  expect(facts.css).not.toContain("--color-surface-canvas");
});
