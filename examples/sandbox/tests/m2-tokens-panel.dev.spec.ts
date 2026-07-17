import { test, expect } from "@playwright/test";

async function fieldState(page: import("@playwright/test").Page): Promise<{
  topTokenPanel: boolean;
  backgroundToken: string;
  borderRadiusToken: string;
  paddingToken: string;
  borderRadiusRaw: string;
  paddingRaw: string;
}> {
  return await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const fieldValue = (property: string): string => {
      const field = sr?.querySelector(`[data-test="token-field"][data-property="${property}"]`);
      return field?.querySelector('[data-test="token-chip"]')?.textContent?.trim() ?? "";
    };
    const rawValue = (property: string): string => {
      const field = sr?.querySelector(`[data-test="token-field"][data-property="${property}"]`);
      return (field?.querySelector('[data-test="raw-input"]') as HTMLInputElement | null)?.value ?? "";
    };
    return {
      topTokenPanel: Boolean(sr?.querySelector('[data-test="tokens-panel"]')),
      backgroundToken: fieldValue("background-color"),
      borderRadiusToken: fieldValue("border-radius"),
      paddingToken: fieldValue("padding-top"),
      borderRadiusRaw: rawValue("border-radius"),
      paddingRaw: rawValue("padding-top"),
    };
  });
}

test("dev: style editors expose token-backed and raw values in their relevant fields", async ({ page }) => {
  await page.goto("/");

  await page.click("text=Save");

  await expect
    .poll(async () => fieldState(page), { timeout: 5000 })
    .toEqual({
      topTokenPanel: false,
      backgroundToken: "--color-surface-raised",
      borderRadiusToken: "",
      paddingToken: "",
      borderRadiusRaw: "999px",
      paddingRaw: "0px",
    });
});

test("dev: relevant value fields update when the selection steps up the hierarchy", async ({ page }) => {
  await page.goto("/");

  await page.click("text=Save");

  await expect
    .poll(async () => (await fieldState(page)).borderRadiusRaw, { timeout: 5000 })
    .toBe("999px");

  await page.keyboard.press("ArrowUp");

  await expect
    .poll(async () => (await fieldState(page)).borderRadiusRaw, { timeout: 5000 })
    .toBe("0px");
});

test("dev: spacing token suggestions exclude color and typography tokens", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Save");

  const input = page.locator('[data-test="token-field"][data-property="padding-top"] [data-test="raw-input"]');
  await input.fill("");

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

test("dev: token picker keeps pointer selection and scroll inside a bounded menu", async ({ page }) => {
  await page.goto("/tailwind");
  await page.locator("#tailwind-title").click();

  const field = page.locator('[data-test="token-field"][data-property="font-size"]');
  const chip = field.locator('[data-test="token-chip"]');
  await expect(chip).toBeVisible();

  const currentToken = (await chip.textContent())?.trim() ?? "";
  await chip.click();

  const popup = page.locator(".dt-popover-listbox__popup");
  await expect(popup).toBeVisible();
  const dimensions = await popup.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(420);
  expect(dimensions.scrollHeight).toBeGreaterThan(dimensions.clientHeight);

  const panelBody = page.locator(".dt-panel__body");
  const panelScrollTop = await panelBody.evaluate((element) => element.scrollTop);
  await popup.hover();
  await page.mouse.wheel(0, 500);
  await expect
    .poll(async () => popup.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);
  expect(await panelBody.evaluate((element) => element.scrollTop)).toBe(panelScrollTop);

  const option = popup.locator('[data-test="suggestion-item"]').filter({ hasNotText: currentToken }).first();
  await option.click();
  await expect(chip).not.toHaveText(currentToken);
});
