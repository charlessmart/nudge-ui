import { test, expect } from "@playwright/test";

async function waitForAtRuleIndicator(
  page: import("@playwright/test").Page,
  property: string,
): Promise<import("@playwright/test").Locator> {
  const indicator = page.locator(
    `[data-test="token-field"][data-property="${property}"] [data-test="at-rule-indicator"]`,
  );
  await expect(indicator).toBeVisible({ timeout: 5000 });
  return indicator;
}

test("dev: a winning media-query declaration is marked and explained in the inspector", async ({ page }) => {
  await page.goto("/");
  await page.addStyleTag({ content: "@media (min-width: 1px) { .btn { font-size: 17px; } }" });
  await page.click("text=Save");

  const indicator = await waitForAtRuleIndicator(page, "font-size");
  await expect(indicator).toContainText("Media");
  await indicator.hover();
  await expect(page.locator(".dt-at-rule-tooltip-positioner")).toHaveCSS("z-index", "3");
  await expect(page.locator('[data-test="at-rule-tooltip"]')).toContainText("Active in current preview");
  await expect(page.locator('[data-test="at-rule-tooltip"]')).toContainText("@media");
  await expect(page.locator('[data-test="at-rule-tooltip"]')).toContainText("(min-width: 1px)");
});

test("dev: a matching container-query declaration is marked and explained in the inspector", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const button = document.querySelector(".btn") as HTMLElement | null;
    if (!button?.parentElement) throw new Error("Expected sandbox Save button");
    button.parentElement.style.setProperty("container-type", "inline-size");
    button.parentElement.style.width = "480px";
  });
  await page.addStyleTag({ content: "@container (width > 100px) { .btn { font-size: 19px; } }" });
  await page.click("text=Save");

  const indicator = await waitForAtRuleIndicator(page, "font-size");
  await expect(indicator).toContainText("Container");
  await indicator.hover();
  await expect(page.locator('[data-test="at-rule-tooltip"]')).toContainText("Active in current preview");
  await expect(page.locator('[data-test="at-rule-tooltip"]')).toContainText("@container");
  await expect(page.locator('[data-test="at-rule-tooltip"]')).toContainText("(width > 100px)");
});

