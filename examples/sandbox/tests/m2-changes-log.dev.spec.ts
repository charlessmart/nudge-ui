import { test, expect } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";

async function sheetText(page: import("@playwright/test").Page): Promise<string> {
  return managedSheetText(page);
}

async function waitForRow(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const sr = document.getElementById("design-tool-root")?.shadowRoot;
        return !!sr?.querySelector('[data-test="style-editors"] [data-test="token-field"]');
      });
    }, { timeout: 5000 })
    .toBe(true);
}

async function waitForEditors(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const sr = document.getElementById("design-tool-root")?.shadowRoot;
        return !!sr?.querySelector('[data-test="style-editors"]');
      });
    }, { timeout: 5000 })
    .toBe(true);
}

async function changeCount(page: import("@playwright/test").Page): Promise<number> {
  return await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    return sr?.querySelectorAll('[data-test="change-row"]').length ?? 0;
  });
}

async function openChangesLog(page: import("@playwright/test").Page): Promise<void> {
  const changes = page.locator('[data-test="changes-log"]');
  await expect(changes).toBeAttached();
  const isOpen = await changes.evaluate((element) => (element as HTMLDetailsElement).open);
  if (!isOpen) await changes.locator('[data-test="changes-toggle"]').click();
  await expect.poll(() => changes.evaluate((element) => (element as HTMLDetailsElement).open)).toBe(true);
}

async function btnBackground(page: import("@playwright/test").Page): Promise<string> {
  return await page.evaluate(() => {
    const btn = document.querySelector(".btn") as HTMLElement | null;
    return btn ? getComputedStyle(btn).backgroundColor : "";
  });
}

async function selectBackground(page: import("@playwright/test").Page, value: string): Promise<void> {
  await page.locator('[data-test="token-field"][data-property="background-color"] [data-test="token-chip"]').click();
  await expect
    .poll(async () => page.evaluate((token) => {
      const sr = document.getElementById("design-tool-root")?.shadowRoot;
      return Array.from(sr?.querySelectorAll('[data-test="suggestion-item"]') ?? [])
        .some((item) => item.textContent?.includes(token));
    }, value), { timeout: 5000 })
    .toBe(true);
  await page.evaluate((token) => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    Array.from(sr?.querySelectorAll<HTMLElement>('[data-test="suggestion-item"]') ?? [])
      .find((item) => item.textContent?.includes(token))?.click();
  }, value);
}

async function setFontSize(page: import("@playwright/test").Page, value: string): Promise<void> {
  await page.evaluate((v) => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
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

async function revertChange(page: import("@playwright/test").Page, property: string): Promise<void> {
  await openChangesLog(page);
  const handle = await page.evaluateHandle((p) => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const rows = Array.from(sr?.querySelectorAll('[data-test="change-row"]') ?? []);
    const row = rows.find((r) => (r.getAttribute("data-property") ?? "") === p);
    return row?.querySelector('[data-test="change-revert"]') as HTMLElement | null;
  }, property);
  await handle.asElement()!.click();
}

test("dev: changes log records token swap and font-size edit, single-change revert rebuilds sheet", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Save");
  await waitForRow(page);
  await waitForEditors(page);

  // Selection happens on pointer down; let the host button's hover transition
  // settle before recording the baseline that revert should restore.
  await page.mouse.move(0, 0);
  await page.waitForTimeout(220);
  const originalBg = await btnBackground(page);

  await selectBackground(page, "--color-surface-sunken");
  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("--color-surface-sunken");
  await expect.poll(async () => changeCount(page), { timeout: 5000 }).toBe(1);

  await setFontSize(page, "18px");
  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("font-size: 18px");
  await expect.poll(async () => changeCount(page), { timeout: 5000 }).toBe(2);

  await revertChange(page, "font-size");
  await expect.poll(async () => changeCount(page), { timeout: 5000 }).toBe(1);
  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .not.toContain("font-size");
  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("--color-surface-sunken");

  await revertChange(page, "background");
  await expect.poll(async () => changeCount(page), { timeout: 5000 }).toBe(0);
  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .not.toContain("background");
  await expect
    .poll(async () => btnBackground(page), { timeout: 5000 })
    .toBe(originalBg);
});

test("dev: changes log survives inspector toggle (Alt+I) without losing entries", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Save");
  await waitForRow(page);

  await selectBackground(page, "--color-surface-sunken");
  await expect.poll(async () => changeCount(page), { timeout: 5000 }).toBe(1);

  await page.keyboard.press("Alt+i");
  await expect
    .poll(async () => changeCount(page), { timeout: 5000 })
    .toBe(1);

  await page.keyboard.press("Alt+i");
  await expect.poll(async () => changeCount(page), { timeout: 5000 }).toBe(1);
  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("--color-surface-sunken");
});
