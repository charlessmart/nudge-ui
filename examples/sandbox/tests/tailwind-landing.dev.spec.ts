import { expect, test } from "@playwright/test";

test("dev: Tailwind landing page renders utility-styled content", async ({ page }) => {
  await page.goto("/tailwind");

  await expect(page.getByRole("heading", { name: /Less ceremony/i })).toBeVisible();
  await expect(page.getByRole("link", { name: /Start a workspace/i })).toBeVisible();

  const hero = page.locator("main");
  await expect(hero).toHaveClass(/bg-stone-950/);
  await expect(page.locator("[class*='bg-lime-300']").first()).toBeVisible();
});

test("dev: Tailwind post-transform theme tokens reach the virtual catalog", async ({ page }) => {
  await page.goto("/tailwind");

  await expect.poll(async () => page.evaluate(() => {
    const catalog = (window as unknown as {
      __designTokenCatalog?: { cssName: string; declarations: { source: string; context?: { selector?: string } }[] }[];
    }).__designTokenCatalog ?? [];
    const token = catalog.find((entry) => entry.cssName === "--color-lime-300");
    return token ? {
      source: token.declarations[0]?.source,
      selector: token.declarations[0]?.context?.selector,
    } : null;
  })).toEqual({
    source: expect.stringContaining("src/tailwind.css:"),
    selector: ":root, :host",
  });
});

test("dev: Tailwind local aliases resolve to global tokens in the inspector", async ({ page }) => {
  await page.goto("/tailwind");
  await page.locator("#notes blockquote").click();

  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    return root?.querySelector('[data-test="token-field"][data-property="line-height"] [data-test="token-chip"]')?.textContent?.trim() ?? null;
  })).toBe("--leading-tight");
});

test("dev: Tailwind inherited color resolves from an ancestor utility", async ({ page }) => {
  await page.goto("/tailwind");
  await page.locator("#tailwind-title").click();

  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    return root?.querySelector('[data-test="token-field"][data-property="color"] [data-test="token-chip"]')?.textContent?.trim() ?? null;
  })).toBe("--color-stone-100");
});
