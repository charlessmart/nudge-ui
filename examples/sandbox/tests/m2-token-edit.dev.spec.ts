import { test, expect } from "@playwright/test";

type RowInfo = {
  property: string;
  token: string;
  name: string;
  value: string;
};

async function tokenRows(page: import("@playwright/test").Page): Promise<RowInfo[]> {
  return await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const rows = sr?.querySelectorAll('[data-test="token-field"]') ?? [];
    const out: RowInfo[] = [];
    rows.forEach((row) => {
      const property = row.getAttribute("data-property") ?? "";
      const select = row.querySelector('[data-test="token-select"]') as HTMLSelectElement | null;
      const token = select?.value ?? "";
      const name = token;
      const value = row.querySelector('[data-test="raw-input"]')?.getAttribute("value") ?? "";
      out.push({ property, token, name: name.trim(), value: value.trim() });
    });
    return out;
  });
}

async function waitForRow(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(async () => {
      const rows = await tokenRows(page);
      return rows.length > 0 ? rows : null;
    }, { timeout: 5000 })
    .toBeTruthy();
}

async function sheetText(page: import("@playwright/test").Page): Promise<string> {
  return await page.evaluate(() => document.getElementById("design-tool-styles")?.textContent ?? "");
}

async function btnBackground(page: import("@playwright/test").Page): Promise<string> {
  return await page.evaluate(() => {
    const btn = document.querySelector(".btn") as HTMLElement | null;
    return btn ? getComputedStyle(btn).backgroundColor : "";
  });
}

async function selectBackground(page: import("@playwright/test").Page, value: string): Promise<void> {
  await page.locator('[data-test="token-field"][data-property="background-color"] [data-test="token-select"]').selectOption(value);
}

async function selectPromote(page: import("@playwright/test").Page, property: string, value: string): Promise<void> {
  await page.locator(`[data-test="token-field"][data-property="${property}"] [data-test="token-promote-select"]`).selectOption(value);
}

test("dev: swapping a token writes a managed-stylesheet rule and changes background live", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Save");
  await waitForRow(page);

  const before = await btnBackground(page);

  await selectBackground(page, "--color-surface-sunken");

  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("--color-surface-sunken");

  await expect
    .poll(async () => btnBackground(page), { timeout: 5000 })
    .not.toBe(before);
});

test("dev: replacing a hardcoded value with a token writes a rule to the sheet", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Save");
  await waitForRow(page);

  await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    (sr?.querySelector('[data-test="token-field"][data-property="border-radius"] [data-test="delink-btn"]') as HTMLElement | null)?.click();
  });
  await selectPromote(page, "border-radius", "--space-2");

  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("border-radius: var(--space-2);");
});

test("dev: edits survive a React re-render of the host app", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Save");
  await waitForRow(page);

  await selectBackground(page, "--color-surface-sunken");

  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("--color-surface-sunken");

  await expect(page.locator('[data-test="click-counter"]')).toHaveText(/clicks: 0/);

  await page.evaluate(() => {
    const fn = (window as unknown as { __designToolRerender?: () => void }).__designToolRerender;
    fn?.();
    fn?.();
  });

  await expect(page.locator('[data-test="click-counter"]')).toHaveText(/clicks: 2/);

  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("--color-surface-sunken");

  const stillSunkenBg = await page.evaluate(() => {
    const btn = document.querySelector(".btn") as HTMLElement | null;
    return btn ? getComputedStyle(btn).backgroundColor : "";
  });
  expect(stillSunkenBg).toMatch(/245, 245, 245/);
});
