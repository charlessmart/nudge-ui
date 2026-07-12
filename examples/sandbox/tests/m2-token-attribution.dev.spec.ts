import { expect, test } from "@playwright/test";

test("dev: catalog retains light and dark declarations for one token", async ({ page }) => {
  await page.goto("/");
  const surface = await page.evaluate(() => {
    const catalog = (window as unknown as { __designTokenCatalog?: { cssName: string; declarations: unknown[] }[] }).__designTokenCatalog ?? [];
    return catalog.find((token) => token.cssName === "--color-surface-raised");
  });
  expect(surface?.declarations).toHaveLength(2);
});

test("dev: panel exposes exact and unknown attribution confidence", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Save");
  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    return [...(root?.querySelectorAll('[data-test="token-row"]') ?? [])].map((row) => ({
      property: row.getAttribute("data-property"),
      confidence: row.getAttribute("data-confidence"),
    }));
  })).toEqual(expect.arrayContaining([
    { property: "background", confidence: "exact" },
    { property: "cursor", confidence: "unknown" },
  ]));
});
