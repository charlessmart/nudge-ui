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

test("dev: Tailwind v4 color opacity keeps base token, alpha, and painted preview separate", async ({ page }) => {
  await page.goto("/tailwind");
  const fixture = page.locator('[data-test="tailwind-alpha"]');
  await expect(fixture).toBeVisible();
  const facts = await fixture.evaluate((element) => ({
    authored: [...document.styleSheets].flatMap((sheet) => {
      try { return [...sheet.cssRules]; } catch { return []; }
    }).map((rule) => rule.cssText).find((text) => text.includes("bg-red-500")) ?? "",
    computed: getComputedStyle(element).backgroundColor,
    catalog: (window as unknown as { __designTokenCatalog?: { cssName: string; adapter?: string; origin?: string }[] }).__designTokenCatalog ?? [],
  }));
  expect(facts.authored).toContain("--color-red-500");
  expect(facts.authored).toContain("10%");
  expect(facts.computed).not.toBe("");
  expect(facts.catalog.find((entry) => entry.cssName === "--color-red-500")).toMatchObject({ adapter: "tailwind-v4" });

  await fixture.click();
  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    return root?.querySelector('[data-test="token-attribution"]')?.textContent?.trim() ?? null;
  })).toContain("--color-red-500");
});
