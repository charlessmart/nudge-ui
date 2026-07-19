import { test, expect } from "@playwright/test";

async function managedSheet(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => document.getElementById("design-tool-styles")?.textContent ?? "");
}

async function consumerBackgrounds(page: import("@playwright/test").Page): Promise<string[]> {
  return page.evaluate(() => [".btn", ".demo-panel"].map((selector) => {
    const element = document.querySelector(selector) as HTMLElement | null;
    return element ? getComputedStyle(element).backgroundColor : "";
  }));
}

test("dev: Tokens tab edits only the active theme token and updates every consumer", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await page.locator('[data-test="tokens-tab"]').click();

  const row = page.locator('[data-test="global-token-row"][data-token-name="--color-surface-raised"]');
  await expect(row).toBeVisible();
  await expect(row.locator('.dt-token-row__inline .dt-token-row__name')).toContainText("--color-surface-raised");
  await expect(row.locator('.dt-token-row__inline [data-test="token-field"]')).toBeVisible();
  await expect(row.locator('[data-test="token-context"]')).toHaveCount(0);
  await expect(row.locator('[data-test="token-source"]')).toHaveCount(0);
  await expect(row.locator('[data-test="token-color-swatch"]')).toBeVisible();
  await expect(row.locator('[data-test="token-color-input"]')).toHaveAttribute("type", "color");

  const input = row.locator('[data-test="raw-input"]');
  await input.fill("#123456");
  await input.press("Enter");

  await expect.poll(() => managedSheet(page)).toContain(':root[data-theme="dark"]');
  await expect.poll(() => managedSheet(page)).toContain("--color-surface-raised: #123456;");
  await expect.poll(() => consumerBackgrounds(page)).toEqual(["rgb(18, 52, 86)", "rgb(18, 52, 86)"]);

  await page.evaluate(() => document.documentElement.removeAttribute("data-theme"));
  await expect(row.locator('[data-test="token-context"]')).toHaveCount(0);
  await expect.poll(() => consumerBackgrounds(page)).toEqual(["rgb(255, 255, 255)", "rgb(255, 255, 255)"]);
});

test("dev: Tokens tab searches the global catalog", async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-test="tokens-tab"]').click();
  await page.locator('[data-test="token-search"]').fill("text-primary");
  await expect(page.locator('[data-test="global-token-row"]')).toHaveCount(1);
  await expect(page.locator('[data-test="global-token-row"]')).toHaveAttribute("data-token-name", "--color-text-primary");
});
