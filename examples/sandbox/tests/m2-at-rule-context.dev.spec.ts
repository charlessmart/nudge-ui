import { test, expect } from "@playwright/test";
import { getAppFrame, openEditor } from "@nudge-ui/compatibility/playwright";

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
  const app = await openEditor(page, "/playground");
  await (await getAppFrame(page)).addStyleTag({ content: `
    @media (min-width: 1px) {
      @media (min-width: 1px) {
        @media (min-width: 1px) { .btn { font-size: 17px; } }
      }
    }
  ` });
  await app.getByRole("button", { name: "Save" }).click();

  const indicator = await waitForAtRuleIndicator(page, "font-size");
  await expect(indicator).toHaveText("3");
  await indicator.hover();
  await expect(page.locator(".at-rule-tooltip-positioner")).toHaveCSS("z-index", "3");
  const activeRule = page.locator('[data-test="at-rule-tooltip"] [data-active="true"]');
  await expect(activeRule).toHaveText(["(min-width: 1px)", "(min-width: 1px)", "(min-width: 1px)"]);
});

test("dev: a media-query popover lists all property candidates and highlights the winner", async ({ page }) => {
  const app = await openEditor(page, "/playground");
  await (await getAppFrame(page)).addStyleTag({ content: `
    @media (min-width: 1px) { .btn { font-size: 17px; } }
    @media (min-width: 9999px) { .btn { font-size: 19px; } }
  ` });
  await app.getByRole("button", { name: "Save" }).click();

  const indicator = await waitForAtRuleIndicator(page, "font-size");
  await indicator.hover();
  const rules = page.locator('[data-test="at-rule-tooltip"] .at-rule-tooltip__rule');
  await expect(rules).toHaveCount(2);
  await expect(rules.nth(0)).toHaveAttribute("data-active", "true");
  await expect(rules.nth(1)).toHaveAttribute("data-active", "false");
});

test("dev: a matching container-query declaration is shown in the context popover", async ({ page }) => {
  const app = await openEditor(page, "/playground");
  await expect(app.locator(".site-shell")).toBeVisible();
  const appFrame = await getAppFrame(page);
  await appFrame.evaluate(() => {
    const button = document.querySelector(".btn") as HTMLElement | null;
    if (!button?.parentElement) throw new Error("Expected sandbox Save button");
    button.parentElement.style.setProperty("container-type", "inline-size");
    button.parentElement.style.width = "480px";
  });
  await appFrame.addStyleTag({ content: "@container (width > 100px) { .btn { font-size: 19px; } }" });
  await app.getByRole("button", { name: "Save" }).click();

  const indicator = await waitForAtRuleIndicator(page, "font-size");
  await expect(indicator).toHaveText("1");
  await indicator.hover();
  await expect(page.locator('[data-test="at-rule-tooltip"] [data-active="true"]')).toHaveText("(width > 100px)");
});
