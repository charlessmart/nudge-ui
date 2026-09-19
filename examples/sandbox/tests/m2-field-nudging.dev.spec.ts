import { test, expect } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";
import { appLocator, openEditor } from "@nudge-ui/compatibility/playwright";

async function panelOpen(page: import("@playwright/test").Page): Promise<string | null> {
  return page.evaluate(() => document
    .getElementById("nudge-ui-root")
    ?.shadowRoot
    ?.querySelector(".panel")
    ?.getAttribute("data-open") ?? null);
}

async function managedSheet(page: import("@playwright/test").Page): Promise<string> {
  return managedSheetText(page);
}

async function openTokensSettings(page: import("@playwright/test").Page): Promise<void> {
  await page.locator('[data-test="tokens-button"]').click();
  await expect(page.locator('[data-test="settings-section-tokens"]')).toBeVisible();
}

test("dev: focused inspector text inputs keep arrow cursor navigation", async ({ page }) => {
  await openEditor(page, "/playground");
  await openTokensSettings(page);

  const search = page.locator('[data-test="token-search"]');
  await search.fill("abc");
  await search.focus();
  await search.evaluate((input) => {
    const textInput = input as HTMLInputElement;
    textInput.setSelectionRange(textInput.value.length, textInput.value.length);
  });
  await search.press("ArrowLeft");

  await expect(search).toHaveValue("abc");
  await expect.poll(() => search.evaluate((input) => (input as HTMLInputElement).selectionStart)).toBe(2);
});

test("dev: focused inspector inputs do not delete the selected element", async ({ page }) => {
  await openEditor(page, "/playground");
  const heading = appLocator(page, "#hero-title");
  await heading.click();
  await openTokensSettings(page);

  const search = page.locator('[data-test="token-search"]');
  await search.fill("x");
  await search.press("Backspace");

  await expect(search).toHaveValue("");
  await expect(heading).toBeAttached();
});

test("dev: numeric fields nudge previews immediately and visibility shortcuts preserve state", async ({ page }) => {
  await openEditor(page, "/playground");
  await appLocator(page, ".hero-intro").click();

  const lineHeight = page.locator('[data-test="token-field"][data-property="line-height"] [data-test="raw-input"]');
  await expect(lineHeight).toBeVisible();
  await lineHeight.focus();
  await lineHeight.press("ArrowUp");
  await expect(lineHeight).toHaveValue("170%");
  await expect.poll(() => managedSheet(page)).toContain("line-height: 170%;");

  await lineHeight.press("Shift+ArrowDown");
  await expect(lineHeight).toHaveValue("90%");
  await expect.poll(() => managedSheet(page)).toContain("line-height: 90%;");
  await expect(page.locator('[data-test="change-row"][data-property="line-height"]')).toHaveCount(1);

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const before = await panelOpen(page);
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", {
    key: "|",
    code: "Backslash",
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  })));
  expect(await panelOpen(page)).not.toBe(before);
  await expect.poll(() => managedSheet(page)).toContain("line-height: 90%;");

  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", {
    key: "\\",
    code: "Backslash",
    metaKey: true,
    bubbles: true,
    cancelable: true,
  })));
  expect(await panelOpen(page)).toBe(before);

  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", {
    key: "\\",
    code: "Backslash",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  })));
  expect(await panelOpen(page)).not.toBe(before);

  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent("keydown", {
    key: "|",
    code: "Backslash",
    shiftKey: true,
    bubbles: true,
    cancelable: true,
  })));
  expect(await panelOpen(page)).toBe(before);
  await expect(lineHeight).toHaveValue("90%");

  await lineHeight.focus();
  await page.evaluate(() => {
    const input = document.getElementById("nudge-ui-root")?.shadowRoot
      ?.querySelector('[data-test="token-field"][data-property="line-height"] [data-test="raw-input"]');
    input?.dispatchEvent(new KeyboardEvent("keydown", {
      key: "\\",
      code: "Backslash",
      ctrlKey: true,
      bubbles: true,
      composed: true,
      cancelable: true,
    }));
  });
  expect(await panelOpen(page)).toBe(before);
});
