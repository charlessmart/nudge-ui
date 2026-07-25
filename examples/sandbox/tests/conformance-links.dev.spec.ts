import { expect, test } from "@playwright/test";

test("dev: main demo links to every conformance page", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const links = page.locator('[data-test="conformance-link"]');
  await expect(links).toHaveCount(8);

  await expect(links.evaluateAll((elements) => elements.map((element) => element.getAttribute("href")))).resolves.toEqual([
    "/conformance",
    "/examples",
    "/spacing-conformance",
    "/typography-conformance",
    "/color-conformance",
    "/border-conformance",
    "/tailwind-v3",
    "/sprinkles",
  ]);
});

test("dev: conformance links navigate away from the main demo", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.locator('[data-conformance-route="/conformance"]').click();

  await expect(page).toHaveURL(/\/conformance$/);
  await expect(page.getByRole("heading", { name: "Token conformance fixtures" })).toBeVisible();
});
