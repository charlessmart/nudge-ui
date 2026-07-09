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
    const panel = sr?.querySelector('[data-test="tokens-panel"]') ?? null;
    if (!panel) return [];
    const rows = panel.querySelectorAll('[data-test="token-row"]');
    const out: RowInfo[] = [];
    rows.forEach((row) => {
      const property = row.getAttribute("data-property") ?? "";
      const token = row.getAttribute("data-token") ?? "";
      const name = row.querySelector('[data-test="token-name"]')?.textContent ?? "";
      const value = row.querySelector('[data-test="token-value"]')?.textContent ?? "";
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

async function selectPromote(page: import("@playwright/test").Page, property: string, value: string): Promise<void> {
  await page.evaluate(({ p, v }) => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const panel = sr?.querySelector('[data-test="tokens-panel"]');
    if (!panel) return;
    const rows = Array.from(panel.querySelectorAll('[data-test="token-row"]'));
    const row = rows.find((r) => (r.getAttribute("data-property") ?? "") === p);
    const select = row?.querySelector('[data-test="token-promote-select"]') as HTMLSelectElement | null;
    if (!select) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!;
    setter.call(select, v);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }, { p: property, v: value });
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

  await selectPromote(page, "cursor", "--space-1");

  await expect
    .poll(async () => sheetText(page), { timeout: 5000 })
    .toContain("cursor: var(--space-1);");
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