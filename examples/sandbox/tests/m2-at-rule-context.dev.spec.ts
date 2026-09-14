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

test("dev: a winning media-query declaration has a compact context indicator", async ({ page }) => {
  await page.goto("/playground");
  await page.addStyleTag({ content: `
    @media (min-width: 1px) {
      @media (min-width: 1px) {
        @media (min-width: 1px) { .btn { font-size: 17px; } }
      }
    }
  ` });
  await page.click("text=Save");

  const indicator = await waitForAtRuleIndicator(page, "font-size");
  await expect(indicator).toHaveText("3");
  await indicator.hover();
  await expect(page.locator(".at-rule-tooltip-positioner")).toHaveCSS("z-index", "3");
  const activeRule = page.locator('[data-test="at-rule-tooltip"] [data-active="true"]');
  await expect(activeRule).toHaveText(["(min-width: 1px)", "(min-width: 1px)", "(min-width: 1px)"]);
});

test("dev: a media-query popover lists all property candidates and highlights the winner", async ({ page }) => {
  await page.goto("/playground");
  await page.addStyleTag({ content: `
    @media (min-width: 1px) { .btn { font-size: 17px; } }
    @media (min-width: 9999px) { .btn { font-size: 19px; } }
  ` });
  await page.click("text=Save");

  const indicator = await waitForAtRuleIndicator(page, "font-size");
  await indicator.hover();
  const rules = page.locator('[data-test="at-rule-tooltip"] .at-rule-tooltip__rule');
  await expect(rules).toHaveCount(2);
  await expect(rules.nth(0)).toHaveAttribute("data-active", "true");
  await expect(rules.nth(1)).toHaveAttribute("data-active", "false");
});

test("dev: a matching container-query declaration is shown in the context popover", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator(".site-shell")).toBeVisible();
  await page.evaluate(() => {
    const button = document.querySelector(".btn") as HTMLElement | null;
    if (!button?.parentElement) throw new Error("Expected sandbox Save button");
    button.parentElement.style.setProperty("container-type", "inline-size");
    button.parentElement.style.width = "480px";
  });
  await page.addStyleTag({ content: "@container (width > 100px) { .btn { font-size: 19px; } }" });
  await page.click("text=Save");

  const indicator = await waitForAtRuleIndicator(page, "font-size");
  await expect(indicator).toHaveText("1");
  await indicator.hover();
  await expect(page.locator('[data-test="at-rule-tooltip"] [data-active="true"]')).toHaveText("(width > 100px)");
});
