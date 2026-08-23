import { test, expect } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("dev: virtual:design-tokens module renders populated token table", async ({ page }) => {
  await page.goto("/playground");

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
  await page.goto("/playground");

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

test("dev: ordinary CSS inventory reaches browser inspection, managed preview, and prompt", async ({ page }) => {
  await page.goto("/playground");

  const inventoryEvidence = await page.evaluate(() => {
    const catalog = (window as unknown as {
      __designTokenCatalog?: Array<{
        cssName: string;
        declarations: Array<{ contribution?: { kind?: string; buildTool?: string } }>;
      }>;
    }).__designTokenCatalog ?? [];
    return catalog.find((definition) => definition.cssName === "--color-surface-sunken")
      ?.declarations[0]?.contribution;
  });
  expect(inventoryEvidence).toMatchObject({ kind: "stylesheet", buildTool: "vite" });

  await page.getByRole("button", { name: "Save" }).click();
  const chip = page.locator(
    '[data-test="token-field"][data-property="background-color"] [data-test="token-chip"]',
  );
  await expect(chip).toBeVisible();
  await chip.click();
  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    return Array.from(root?.querySelectorAll('[data-test="suggestion-item"]') ?? [])
      .some((item) => item.textContent?.includes("--color-surface-sunken"));
  })).toBe(true);
  await page.evaluate(() => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    Array.from(root?.querySelectorAll<HTMLElement>('[data-test="suggestion-item"]') ?? [])
      .find((item) => item.textContent?.includes("--color-surface-sunken"))?.click();
  });

  await expect.poll(() => managedSheetText(page)).toContain("var(--color-surface-sunken)");
  await page.locator('[data-test="copy-prompt"]').click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain("`--color-surface-raised` → `--color-surface-sunken`");
  expect(prompt).toContain("## Selectors (fallback)");
});
