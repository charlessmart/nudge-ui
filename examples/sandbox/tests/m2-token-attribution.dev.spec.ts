import { expect, test } from "@playwright/test";

test("dev: catalog retains light and dark declarations for one token", async ({ page }) => {
  await page.goto("/");
  const surface = await page.evaluate(() => {
    const catalog = (window as unknown as { __designTokenCatalog?: { cssName: string; declarations: unknown[] }[] }).__designTokenCatalog ?? [];
    return catalog.find((token) => token.cssName === "--color-surface-raised");
  });
  expect(surface?.declarations).toEqual(expect.arrayContaining([
    expect.objectContaining({ source: "src/styles.css:4" }),
    expect.objectContaining({ source: "src/styles.css:29" }),
  ]));
});

test("dev: tokenized and raw values appear in their relevant editors", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Save");
  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    return {
      background: Boolean(root?.querySelector('[data-test="token-field"][data-property="background-color"] [data-test="token-chip"]')),
      cursor: Boolean(root?.querySelector('[data-test="token-field"][data-property="cursor"]')),
    };
  })).toEqual({ background: true, cursor: false });
});
