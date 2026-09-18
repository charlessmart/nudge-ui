import { expect, test } from "@playwright/test";
import { openEditor } from "./editor.ts";

test("dev: catalog retains light and dark declarations for one token", async ({ page }) => {
  const app = await openEditor(page, "/playground");
  await expect.poll(() => app.locator("html").evaluate(() => {
    const catalog = (window as unknown as { __designTokenCatalog?: { cssName: string }[] }).__designTokenCatalog ?? [];
    return catalog.some((token) => token.cssName === "--color-surface-raised");
  })).toBe(true);
  const surface = await app.locator("html").evaluate(() => {
    const catalog = (window as unknown as { __designTokenCatalog?: { cssName: string; declarations: unknown[] }[] }).__designTokenCatalog ?? [];
    return catalog.find((token) => token.cssName === "--color-surface-raised");
  });
  expect(surface?.declarations).toEqual(expect.arrayContaining([
    expect.objectContaining({
      source: expect.stringMatching(/^src\/styles\.css:\d+$/),
      value: "#ffffff",
    }),
    expect.objectContaining({
      context: { selector: ':root[data-theme="dark"]' },
      source: expect.stringMatching(/^src\/styles\.css:\d+$/),
      value: "#17151f",
    }),
  ]));
});

test("dev: tokenized and raw values appear in their relevant editors", async ({ page }) => {
  const app = await openEditor(page, "/playground");
  await app.getByRole("button", { name: "Save" }).click();
  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("nudge-ui-root")?.shadowRoot;
    return {
      background: Boolean(root?.querySelector('[data-test="token-field"][data-property="background-color"] [data-test="token-chip"]')),
      cursor: Boolean(root?.querySelector('[data-test="token-field"][data-property="cursor"]')),
    };
  })).toEqual({ background: true, cursor: false });
});
