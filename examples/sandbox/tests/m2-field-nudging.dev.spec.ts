import { test, expect } from "@playwright/test";

async function panelOpen(page: import("@playwright/test").Page): Promise<string | null> {
  return page.evaluate(() => document
    .getElementById("design-tool-root")
    ?.shadowRoot
    ?.querySelector(".dt-panel")
    ?.getAttribute("data-open") ?? null);
}

async function managedSheet(page: import("@playwright/test").Page): Promise<string> {
  return page.evaluate(() => document.getElementById("design-tool-styles")?.textContent ?? "");
}

test("dev: numeric fields nudge previews immediately and the inspector visibility shortcut preserves state", async ({ page }) => {
  await page.goto("/");
  await page.locator(".hero-intro").click();

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
    const input = document.getElementById("design-tool-root")?.shadowRoot
      ?.querySelector('[data-test="token-field"][data-property="line-height"] [data-test="raw-input"]');
    input?.dispatchEvent(new KeyboardEvent("keydown", {
      key: "|",
      code: "Backslash",
      shiftKey: true,
      bubbles: true,
      composed: true,
      cancelable: true,
    }));
  });
  expect(await panelOpen(page)).toBe(before);
});
