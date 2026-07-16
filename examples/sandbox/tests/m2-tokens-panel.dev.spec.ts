import { test, expect } from "@playwright/test";

async function fieldState(page: import("@playwright/test").Page): Promise<{
  topTokenPanel: boolean;
  backgroundToken: string;
  borderRadiusToken: string;
  paddingToken: string;
}> {
  return await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const fieldValue = (property: string): string => {
      const field = sr?.querySelector(`[data-test="token-field"][data-property="${property}"]`);
      return field?.querySelector('[data-test="token-chip"]')?.textContent?.trim() ?? "";
    };
    return {
      topTokenPanel: Boolean(sr?.querySelector('[data-test="tokens-panel"]')),
      backgroundToken: fieldValue("background-color"),
      borderRadiusToken: fieldValue("border-radius"),
      paddingToken: fieldValue("padding-top"),
    };
  });
}

test("dev: style editors expose tokens in their relevant value fields", async ({ page }) => {
  await page.goto("/");

  await page.click("text=Save");

  await expect
    .poll(async () => fieldState(page), { timeout: 5000 })
    .toEqual({
      topTokenPanel: false,
      backgroundToken: "--color-surface-raised",
      borderRadiusToken: "--space-1",
      paddingToken: "--space-1",
    });
});

test("dev: relevant value fields update when the selection steps up the hierarchy", async ({ page }) => {
  await page.goto("/");

  await page.click("text=Save");

  await expect
    .poll(async () => (await fieldState(page)).paddingToken, { timeout: 5000 })
    .toBe("--space-1");

  await page.keyboard.press("ArrowUp");

  await expect
    .poll(async () => (await fieldState(page)).paddingToken, { timeout: 5000 })
    .toBe("--space-2");
});

test("dev: spacing token suggestions exclude color and typography tokens", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Save");

  await page.locator('[data-test="token-field"][data-property="padding-top"] [data-test="token-chip"]').click();

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const sr = document.getElementById("design-tool-root")?.shadowRoot;
        return Array.from(sr?.querySelectorAll('[data-test="suggestion-item"]') ?? [])
          .map((item) => item.querySelector('.dt-popover-listbox__label')?.textContent ?? "");
      });
    }, { timeout: 5000 })
    .toEqual(["--space-1", "--space-2", "--space-3"]);
});
