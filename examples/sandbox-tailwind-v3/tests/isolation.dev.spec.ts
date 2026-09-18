import { expect, test } from "@playwright/test";
import { openEditor } from "./editor.ts";

test("Tailwind v3 owns its PostCSS stylesheet graph and catalog", async ({ page }) => {
  const app = await openEditor(page, "/examples");
  const facts = await app.locator("html").evaluate(() => ({
    css: Array.from(document.styleSheets).flatMap((sheet) => {
      try { return Array.from(sheet.cssRules).map((rule) => rule.cssText); } catch { return []; }
    }).join("\n"),
    catalog: (window as unknown as { __designTokenCatalog?: Array<{ name: string; adapter?: string; declarations: Array<{ source: string }> }> }).__designTokenCatalog ?? [],
  }));
  expect(facts.css).toContain(".bg-brand");
  expect(facts.catalog.filter((entry) => entry.name === "theme.colors.brand" && entry.adapter === "tailwind-v3").flatMap((entry) => entry.declarations.map((declaration) => declaration.source)), "Tailwind v3 brand sources").toContain("tailwind.config.ts");
  expect(facts.catalog.some((entry) => entry.adapter === "tailwind-v4" || entry.adapter === "vanilla-extract")).toBe(false);
  expect(facts.css).not.toContain("--color-surface-canvas");
});
