import { expect, test } from "@playwright/test";
import { openEditor } from "./editor.ts";

test("Sprinkles owns generated identifiers and its contract catalog", async ({ page }) => {
  const app = await openEditor(page, "/examples");
  const facts = await app.locator("html").evaluate(() => ({
    classes: Array.from(document.querySelectorAll("[data-cid]"), (element) => element.className).join(" "),
    css: Array.from(document.styleSheets).flatMap((sheet) => {
      try { return Array.from(sheet.cssRules).map((rule) => rule.cssText); } catch { return []; }
    }).join("\n"),
    catalog: (window as unknown as { __designTokenCatalog?: Array<{ name: string; cssName?: string; adapter?: string }> }).__designTokenCatalog ?? [],
  }));
  expect(facts.classes).not.toMatch(/spr-(?:p|bg|text)-/);
  expect(facts.catalog.some((entry) => entry.name === "theme.color.brand" && entry.adapter === "vanilla-extract")).toBe(true);
  expect(facts.catalog.some((entry) => entry.adapter === "tailwind-v3" || entry.adapter === "tailwind-v4")).toBe(false);
  expect(facts.css).not.toContain("--color-surface-canvas");
});
