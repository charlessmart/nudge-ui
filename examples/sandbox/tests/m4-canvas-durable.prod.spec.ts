import { test, expect } from "@playwright/test";

test("prod: no nudge-ui session data in localStorage", async ({ page }) => {
  await page.goto("/");

  const hasNudgeUiKeys = await page.evaluate(() => {
    const keys = Object.keys(localStorage);
    return keys.some((k) => k.startsWith("nudge-ui:"));
  });
  expect(hasNudgeUiKeys).toBe(false);
});

test("prod: managed stylesheet is absent", async ({ page }) => {
  await page.goto("/");

  const hasManagedSheet = await page.evaluate(() => {
    return document.getElementById("nudge-ui-styles") !== null;
  });
  expect(hasManagedSheet).toBe(false);
});

test("prod: no canvas or inspector persisted state", async ({ page }) => {
  await page.goto("/");

  // No canvas host element
  const hasCanvasHost = await page.evaluate(() => {
    return document.getElementById("nudge-ui-canvas-host") !== null;
  });
  expect(hasCanvasHost).toBe(false);

  // No session management UI
  const pageHtml = await page.content();
  expect(pageHtml).not.toContain("restore-notice");
  expect(pageHtml).not.toContain("clear-session");
});
