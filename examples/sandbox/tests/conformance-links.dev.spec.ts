import { expect, test } from "@playwright/test";

test("dev: main demo links to every conformance page", async ({ page }) => {
  await page.goto("/playground");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const links = page.locator('[data-test="conformance-link"]');
  await expect(links).toHaveCount(10);

  await expect(links.evaluateAll((elements) => elements.map((element) => element.getAttribute("href")))).resolves.toEqual([
    "/conformance",
    "/examples",
    "/examples/raw-css",
    "http://localhost:5174/tailwind",
    "http://localhost:5175/tailwind-v3",
    "http://localhost:5176/sprinkles",
    "/spacing-conformance",
    "/typography-conformance",
    "/color-conformance",
    "/border-conformance",
  ]);
});

test("dev: ordinary conformance-link clicks select without navigating", async ({ page }) => {
  await page.goto("/playground");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await page.locator('[data-conformance-route="/conformance"]').click();

  await expect(page).toHaveURL(/\/playground$/);
  await expect(page.locator('[data-test="selection"]')).toBeVisible();
});

test("dev: Command-click follows a conformance link", async ({ page, context }) => {
  await page.goto("/playground");
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  const destinationPage = context.waitForEvent("page");
  await page.locator('[data-conformance-route="/conformance"]').click({ modifiers: ["Meta"] });
  const destination = await destinationPage;

  await expect(destination).toHaveURL(/\/conformance$/);
  await expect(destination.getByRole("heading", { name: "Token conformance fixtures" })).toBeVisible();
  await destination.close();
});
