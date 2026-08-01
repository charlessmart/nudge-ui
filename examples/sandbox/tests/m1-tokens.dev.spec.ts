import { test, expect } from "@playwright/test";

test("dev: virtual:design-tokens module renders populated token table", async ({ page }) => {
  await page.goto("/");

  const tokensSection = page.locator('[data-test="tokens"]');
  await expect(tokensSection).toBeVisible();

  // styles.css declares a semantic color, spacing, radius, and elevation foundation.
  const items = tokensSection.locator("li");
  // Framework-generated Tailwind v4 variables vary with the installed
  // Tailwind release. Project tokens plus the v3 adapter must all be present.
  expect(await items.count()).toBeGreaterThanOrEqual(24);

  await expect(tokensSection).toContainText("--color-surface-raised");
  await expect(tokensSection).toContainText("--color-border-subtle");
  await expect(tokensSection).toContainText("--space-1");

  // Console-visible per acceptance criterion.
  const designTokens = await page.evaluate(
    () => (window as unknown as { __designTokens?: unknown }).__designTokens,
  );
  expect(Array.isArray(designTokens)).toBe(true);
  expect((designTokens as unknown[]).length).toBeGreaterThanOrEqual(20);
});

test("dev: first catalog load follows the active package CSS import graph", async ({ page }) => {
  await page.goto("/");

  const packageTokens = await page.evaluate(() => {
    const catalog = (window as unknown as {
      __designTokenCatalog?: Array<{ cssName: string; origin?: string; editable?: boolean; declarations: Array<{ source: string }> }>;
    }).__designTokenCatalog ?? [];
    return [
      "--color-content-primary",
      "--color-content-secondary",
      "--spacing-200",
      "--border-radius-medium",
    ].map((cssName) => catalog.find((token) => token.cssName === cssName));
  });

  expect(packageTokens).toEqual([
    expect.objectContaining({ origin: "package", editable: false }),
    expect.objectContaining({ origin: "package", editable: false }),
    expect.objectContaining({ origin: "package", editable: false }),
    expect.objectContaining({ origin: "package", editable: false }),
  ]);
  expect(packageTokens[0]?.declarations[0]?.source).toMatch(/package-css-fixture\/theme\.css:4$/);
});

test("dev: a published vanilla-extract contract enriches its active package CSS token", async ({ page }) => {
  await page.goto("/");

  const token = await page.evaluate(() => {
    const catalog = (window as unknown as {
      __designTokenCatalog?: Array<{
        cssName: string;
        name: string;
        origin?: string;
        editable?: boolean;
        adapter?: string;
        declarations: Array<{ value: string; source: string }>;
      }>;
    }).__designTokenCatalog ?? [];
    return {
      matches: catalog.filter((entry) => entry.cssName === "--color-content-primary"),
      diagnostics: (window as unknown as { __designTokenDiagnostics?: unknown[] }).__designTokenDiagnostics ?? [],
    };
  });

  expect(token.matches).toEqual([expect.objectContaining({
    cssName: "--color-content-primary",
    name: "theme.color.content.primary",
    adapter: "vanilla-extract",
    origin: "package",
    editable: false,
    declarations: [expect.objectContaining({ value: "#20211f", source: expect.stringMatching(/package-css-fixture\/theme\.css:4$/) })],
  })]);
  expect(token.diagnostics).toEqual([]);
});
