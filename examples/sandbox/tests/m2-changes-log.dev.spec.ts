import { test, expect } from "@playwright/test";

async function sheetText(page: import("@playwright/test").Page): Promise<string> {
  return await page.evaluate(() => document.getElementById("design-tool-styles")?.textContent ?? "");
}

async function waitForRow(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const sr = document.getElementById("design-tool-root")?.shadowRoot;
        const panel = sr?.querySelector('[data-test="tokens-panel"]');
        return !!panel && panel.querySelectorAll('[data-test="token-row"]').length > 0;
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

async function btnBackground(page: import("@playwright/test").Page): Promise<string> {
  return await page.evaluate(() => {
    const btn = document.querySelector(".btn") as HTMLElement | null;
    return btn ? getComputedStyle(btn).backgroundColor : "";
  });
}

async function selectBackground(page: import("@playwright/test").Page, value: string): Promise<void> {
  await page.evaluate((v) => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const panel = sr?.querySelector('[data-test="tokens-panel"]');
    if (!panel) return;
    const rows = Array.from(panel.querySelectorAll('[data-test="token-row"]'));
    const row = rows.find((r) => (r.getAttribute("data-property") ?? "") === "background");
    const select = row?.querySelector('[data-test="token-select"]') as HTMLSelectElement | null;
    if (!select) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
    setter.call(select, v);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function setFontSize(page: import("@playwright/test").Page, value: string): Promise<void> {
  await page.evaluate((v) => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const input = sr?.querySelector('[data-test="font-size"]') as HTMLInputElement | null;
    if (!input) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, v);
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, value);
}

async function revertChange(page: import("@playwright/test").Page, property: string): Promise<void> {
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

  const originalBg = await btnBackground(page);

  await selectBackground(page, "--color-surface-sunken");
  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("--color-surface-sunken");
  await expect.poll(async () => changeCount(page), { timeout: 5000 }).toBe(1);

  await setFontSize(page, "18");
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
