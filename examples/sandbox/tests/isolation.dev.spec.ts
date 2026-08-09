import { expect, test } from "@playwright/test";

test("dev: raw sandbox owns a raw CSS graph and catalog", async ({ page }) => {
  await page.goto("/examples/raw-css");

  const facts = await page.evaluate(() => {
    const inspection = (window as unknown as {
      __designTool?: { inspect(selector: string): { catalog: Array<{ adapter?: string }> } | null };
    }).__designTool?.inspect('[data-cid="Examples:Spacing:raw:01"]');
    return {
      sheets: Array.from(document.styleSheets).map((sheet) => {
        try { return Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n"); } catch { return sheet.href ?? ""; }
      }),
      classes: Array.from(document.querySelectorAll("[data-cid^='Examples:'] *")).flatMap((element) => Array.from(element.classList)),
      utilityProbe: (() => {
        const probe = document.createElement("div");
        probe.className = "p-4 bg-brand spr-p-md";
        document.body.append(probe);
        const style = getComputedStyle(probe);
        const result = { padding: style.padding, backgroundColor: style.backgroundColor };
        probe.remove();
        return result;
      })(),
      adapters: inspection?.catalog.map((entry) => entry.adapter).filter(Boolean) ?? [],
    };
  });

  const stylesheetText = facts.sheets.join("\n");
  expect(stylesheetText).not.toMatch(/tailwindcss|--tw-|@tailwind/i);
  expect(facts.utilityProbe).toEqual({ padding: "0px", backgroundColor: "rgba(0, 0, 0, 0)" });
  expect(facts.classes.some((className) => className.startsWith("spr-"))).toBe(false);
  expect(facts.adapters).toEqual([]);
});
