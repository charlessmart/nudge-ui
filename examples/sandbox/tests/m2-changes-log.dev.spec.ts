import { test, expect } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";
import { getAppFrame, openEditor } from "@nudge-ui/compatibility/playwright";
import { btnBackground, changeCount, openChangesLog, revertChange, selectBackground, waitForEditors, waitForRow } from "./inspector.ts";

async function setFontSize(page: import("@playwright/test").Page, value: string): Promise<void> {
  await page.evaluate((v) => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    const raw = sr?.querySelector(
      '[data-test="token-field"][data-property="font-size"] [data-test="raw-input"]',
    ) as HTMLInputElement | null;
    if (!raw) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    raw.focus();
    setter.call(raw, v);
    raw.dispatchEvent(new Event("change", { bubbles: true }));
    raw.blur();
  }, value);
}

test("dev: changes log records token swap and font-size edit, single-change revert rebuilds sheet", async ({ page }) => {
  const app = await openEditor(page, "/playground");
  await app.getByRole("button", { name: "Save" }).click();
  await waitForRow(page);
  await waitForEditors(page);

  // Let the hover transition settle before recording the baseline that revert restores.
  await app.locator("body").hover({ position: { x: 1, y: 1 } });
  await page.waitForTimeout(220);
  const originalBg = await btnBackground(page);

  await selectBackground(page, "--color-surface-sunken");
  await expect
    .poll(async () => managedSheetText(page), { timeout: 5000 })
    .toContain("--color-surface-sunken");
  await expect.poll(async () => changeCount(page), { timeout: 5000 }).toBe(1);

  await setFontSize(page, "18px");
  await expect
    .poll(async () => managedSheetText(page), { timeout: 5000 })
    .toContain("font-size: 18px");
  await expect.poll(async () => changeCount(page), { timeout: 5000 }).toBe(2);

  await revertChange(page, "font-size");
  await expect.poll(async () => changeCount(page), { timeout: 5000 }).toBe(1);
  await expect
    .poll(async () => managedSheetText(page), { timeout: 5000 })
    .not.toContain("font-size");
  await expect
    .poll(async () => managedSheetText(page), { timeout: 5000 })
    .toContain("--color-surface-sunken");

  await revertChange(page, "background");
  await expect.poll(async () => changeCount(page), { timeout: 5000 }).toBe(0);
  await expect
    .poll(async () => managedSheetText(page), { timeout: 5000 })
    .not.toContain("background");
  await expect
    .poll(async () => btnBackground(page), { timeout: 5000 })
    .toBe(originalBg);
});

test("dev: changes log survives inspector toggle without losing entries", async ({ page }) => {
  const app = await openEditor(page, "/playground");
  await app.getByRole("button", { name: "Save" }).click();
  await waitForRow(page);

  await selectBackground(page, "--color-surface-sunken");
  await expect.poll(async () => changeCount(page), { timeout: 5000 }).toBe(1);

  const panel = page.locator(".panel");
  await expect(panel).toHaveAttribute("data-open", "true");
  await page.keyboard.press("Control+\\");
  await expect(panel).toHaveAttribute("data-open", "false");
  await expect
    .poll(async () => changeCount(page), { timeout: 5000 })
    .toBe(1);

  await page.keyboard.press("Control+\\");
  await expect(panel).toHaveAttribute("data-open", "true");
  await expect.poll(async () => changeCount(page), { timeout: 5000 }).toBe(1);
  await expect
    .poll(async () => managedSheetText(page), { timeout: 5000 })
    .toContain("--color-surface-sunken");
});
