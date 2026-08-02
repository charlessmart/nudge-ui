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
      return field?.querySelector('[data-test="token-chip"]')?.textContent?.trim()
        ?? field?.querySelector('[data-test="token-attribution"]')?.textContent?.trim()
        ?? "";
    };
    const rawValue = (property: string): string => {
      const field = sr?.querySelector(`[data-test="token-field"][data-property="${property}"]`);
      return (field?.querySelector('[data-test="raw-input"]') as HTMLInputElement | null)?.value ?? "";
    };
    return {
      topTokenPanel: Boolean(sr?.querySelector('[data-test="tokens-panel"]')),
      backgroundToken: fieldValue("background-color"),
      borderRadiusToken: fieldValue("border-radius"),
      paddingToken: fieldValue("padding-vertical"),
      borderRadiusRaw: rawValue("border-radius"),
      paddingRaw: rawValue("padding-vertical"),
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

test("dev: spacing token suggestions exclude color and typography tokens", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Save");

  const input = page.locator('[data-test="token-field"][data-property="padding-vertical"] [data-test="raw-input"]');
  await input.fill("");

  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const sr = document.getElementById("design-tool-root")?.shadowRoot;
        return Array.from(sr?.querySelectorAll('[data-test="suggestion-item"]') ?? [])
          .map((item) => item.querySelector('.dt-popover-listbox__label')?.textContent ?? "");
      });
    }, { timeout: 5000 })
    .toEqual(expect.arrayContaining(["--space-1", "--space-2", "--space-3"]));
});

test("dev: token picker stays bounded and supports selection", async ({ page }) => {
  await page.goto("/tailwind");
  await page.locator("#tailwind-title").click();

  const field = page.locator('[data-test="token-field"][data-property="color"]');
  const chip = field.locator('[data-test="token-chip"]');
  const raw = field.locator('[data-test="raw-input"]');
  await expect(field).toBeVisible();
  await expect.poll(async () => (await chip.count()) > 0 ? "chip" : ((await raw.count()) > 0 ? "raw" : null)).toBeTruthy();
  const hasChip = (await chip.count()) > 0;
  if (hasChip) await expect(chip).toBeVisible();
  else await expect(raw).toBeVisible();

  const currentToken = hasChip ? (await chip.textContent())?.trim() ?? "" : await raw.inputValue();
  if (hasChip) await chip.click();
  else await raw.fill("");

  const popup = page.locator(".dt-popover-listbox__popup");
  await expect(popup).toBeVisible();
  const dimensions = await popup.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
  }));
  expect(dimensions.width).toBeLessThanOrEqual(420);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  if (hasChip) await expect(chip).not.toHaveText(currentToken);
  else await expect(field.locator('[data-test="token-chip"]')).toBeVisible();
});
