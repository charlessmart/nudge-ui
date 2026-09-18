import { expect, test } from "@playwright/test";
import { appLocator, getAppFrame } from "./editor.ts";

test("dev: main demo links to every conformance page", async ({ page }) => {
  await page.goto("/playground");
  await expect(appLocator(page, ".site-shell")).toBeVisible();

  const links = appLocator(page, '[data-test="conformance-link"]');
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

test("dev: ordinary conformance-link clicks navigate the focused editing surface", async ({ page }) => {
  await page.goto("/playground");
  await expect(appLocator(page, ".site-shell")).toBeVisible();
  await expect(page.locator('[data-test="inspect-tab"]')).toBeVisible();

  await appLocator(page, '[data-conformance-route="/conformance"]').click();

  await expect.poll(() => getAppFrame(page).then((frame) => new URL(frame.url()).pathname)).toBe("/conformance");
  await expect(page.locator(".canvas-card__iframe")).toHaveCount(1);
});

test("dev: Command-click selects a conformance link without navigating", async ({ page, context }) => {
  await page.goto("/playground");
  await expect(appLocator(page, ".site-shell")).toBeVisible();
  await expect(page.locator('[data-test="inspect-tab"]')).toBeVisible();

  await appLocator(page, '[data-conformance-route="/conformance"]').click({ modifiers: ["Meta"] });

  await expect.poll(() => getAppFrame(page).then((frame) => new URL(frame.url()).pathname)).toBe("/playground");
  await expect(page.locator('[data-test="selection"]')).toBeVisible();
  expect(context.pages()).toHaveLength(1);
});

test("dev: Command+Shift-click follows a conformance link", async ({ page, context }) => {
  await page.goto("/playground");
  await expect(appLocator(page, ".site-shell")).toBeVisible();

  const destinationPage = context.waitForEvent("page");
  await appLocator(page, '[data-conformance-route="/conformance"]').click({ modifiers: ["Meta", "Shift"] });
  const destination = await destinationPage;

  await expect(destination).toHaveURL(/\/conformance\?nudge-ui=editor(?:&|#|$)/);
  await destination.close();
});
