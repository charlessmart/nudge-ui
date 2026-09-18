import { expect, test } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";
import { openEditor } from "@nudge-ui/compatibility/playwright";

test("dev: Tailwind v3 fixture exposes config provenance, literal spacing values, and opacity helper", async ({ page }) => {
  const app = await openEditor(page, "/tailwind-v3");
  await expect.poll(() => page.evaluate(() => Boolean(
    document.getElementById("nudge-ui-root")?.shadowRoot?.querySelector('[data-test="inspect-tab"]'),
  ))).toBe(true);
  const card = app.locator('[data-test="tailwind-v3-card"]');
  await expect(card).toBeVisible();
  const catalog = await app.locator("html").evaluate(() => (window as unknown as { __designTokenCatalog?: { name: string; adapter?: string; origin?: string; cssValue?: string }[] }).__designTokenCatalog ?? []);
  expect(catalog.find((entry) => entry.name === "theme.colors.brand")).toMatchObject({ adapter: "tailwind-v3", origin: "project" });
  expect(catalog.find((entry) => entry.name === "theme.spacing.3")).toMatchObject({ adapter: "tailwind-v3", cssValue: "0.75rem" });
  await card.click();
  const field = page.locator('[data-test="token-field"][data-property="background-color"]');
  await expect(field.locator('[data-test="token-chip"]')).toContainText("theme.colors.brand");

  await field.locator('[data-test="token-chip"]').click();
  await page.getByRole("option", { name: /theme\.colors\.accent/ }).click();
  await expect.poll(() => managedSheetText(app))
    .toContain("background-color: rgba(171, 205, 239, 0.1);");
});
