import { test, expect } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";
import { getAppFrame, openEditor } from "./editor.ts";

async function managedSheet(page: import("@playwright/test").Page): Promise<string> {
  return managedSheetText(page);
}

async function consumerBackgrounds(page: import("@playwright/test").Page): Promise<string[]> {
  return (await getAppFrame(page)).evaluate(() => [".btn", ".demo-panel"].map((selector) => {
    const element = document.querySelector(selector) as HTMLElement | null;
    return element ? getComputedStyle(element).backgroundColor : "";
  }));
}

async function openTokensSettings(page: import("@playwright/test").Page): Promise<void> {
  await page.locator('[data-test="tokens-button"]').click();
  await expect(page.locator('[data-test="settings-section-tokens"]')).toBeVisible();
}

test("dev: Tokens settings edits only the active theme token and updates every consumer", async ({ page }) => {
  await openEditor(page, "/playground");
  await (await getAppFrame(page)).evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  await openTokensSettings(page);

  const row = page.locator('[data-test="global-token-row"][data-token-name="--color-surface-raised"]');
  await expect(row).toBeVisible();
  await expect(row.locator('.token-row__inline .token-row__name')).toContainText("--color-surface-raised");
  await expect(row.locator('.token-row__inline [data-test="token-field"]')).toBeVisible();
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

  await (await getAppFrame(page)).evaluate(() => document.documentElement.removeAttribute("data-theme"));
  await expect(row.locator('[data-test="token-context"]')).toHaveCount(0);
  await expect.poll(() => consumerBackgrounds(page)).toEqual(["rgb(255, 255, 255)", "rgb(255, 255, 255)"]);
});

test("dev: Tokens settings searches the global catalog", async ({ page }) => {
  await openEditor(page, "/playground");
  await openTokensSettings(page);
  await page.locator('[data-test="token-search"]').fill("text-primary");
  await expect(page.locator('[data-test="global-token-row"]')).toHaveCount(1);
  await expect(page.locator('[data-test="global-token-row"]')).toHaveAttribute("data-token-name", "--color-text-primary");
});

test("dev: nested token wrappers are preserved through the catalog and managed preview", async ({ page }) => {
  await openEditor(page, "/conformance");
  await openTokensSettings(page);

  const row = page.locator('[data-test="global-token-row"][data-token-name="--conformance-nested"]');
  await expect(row).toBeVisible();
  const input = row.locator('[data-test="raw-input"]');
  await input.fill("4rem");
  await input.press("Enter");

  await expect.poll(async () => (await managedSheet(page)).replace(/\s+/g, " ")).toContain(
    "@media (min-width: 1px) { @supports (display: grid) { @layer conformance { @media (min-width: 1px)",
  );
  await expect.poll(async () => (await getAppFrame(page)).evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue("--conformance-nested").trim(),
  )).toBe("4rem");
});
