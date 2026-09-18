import { expect, test } from "@playwright/test";
import { openEditor } from "./editor.ts";

test("dev: token picker stays bounded and supports selection", async ({ page }) => {
  const app = await openEditor(page, "/tailwind");
  await app.locator("#tailwind-title").click();

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

  const popup = page.locator(".popover-listbox__popup");
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
