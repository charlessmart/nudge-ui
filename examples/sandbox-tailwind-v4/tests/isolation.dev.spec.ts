import { expect, test } from "@playwright/test";

test("Tailwind v4 owns its stylesheet graph and catalog", async ({ page }) => {
  await page.goto("/examples");
  const facts = await page.evaluate(() => ({
    sheets: Array.from(document.querySelectorAll("style[data-vite-dev-id], link[rel~='stylesheet']"), (element) => element.getAttribute("data-vite-dev-id") ?? element.getAttribute("href") ?? "").join("\n"),
    css: Array.from(document.styleSheets).flatMap((sheet) => {
      try { return Array.from(sheet.cssRules).map((rule) => rule.cssText); } catch { return []; }
    }).join("\n"),
    catalog: (window as unknown as { __designTokenCatalog?: Array<{ name: string; adapter?: string }> }).__designTokenCatalog ?? [],
  }));
  expect(facts.css).toContain(".p-4");
  expect(facts.sheets).toContain("tailwind.css");
  expect(facts.catalog.some((entry) => entry.adapter === "tailwind-v4")).toBe(true);
  expect(facts.catalog.some((entry) => entry.adapter === "tailwind-v3" || entry.adapter === "vanilla-extract")).toBe(false);
  expect(facts.css).not.toContain("--color-surface-canvas");
});
