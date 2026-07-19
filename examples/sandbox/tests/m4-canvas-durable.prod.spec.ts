import { test, expect } from "@playwright/test";

test("prod: no design-tool session data in localStorage", async ({ page }) => {
  await page.goto("/");

  const hasDesignToolKeys = await page.evaluate(() => {
    const keys = Object.keys(localStorage);
    return keys.some((k) => k.startsWith("design-tool:"));
  });
  expect(hasDesignToolKeys).toBe(false);
});

test("prod: managed stylesheet is absent", async ({ page }) => {
  await page.goto("/");

  const hasManagedSheet = await page.evaluate(() => {
    return document.getElementById("design-tool-styles") !== null;
  });
  expect(hasManagedSheet).toBe(false);
});

test("prod: no canvas or inspector persisted state", async ({ page }) => {
  await page.goto("/");

  // No canvas host element
  const hasCanvasHost = await page.evaluate(() => {
    return document.getElementById("design-tool-canvas-host") !== null;
  });
  expect(hasCanvasHost).toBe(false);

  // No restore notice or session management UI
  const pageHtml = await page.content();
  expect(pageHtml).not.toContain("restore-notice");
  expect(pageHtml).not.toContain("clear-session");
});
