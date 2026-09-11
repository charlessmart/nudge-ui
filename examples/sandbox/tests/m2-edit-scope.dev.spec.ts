import { expect, test } from "@playwright/test";

async function shadowClick(page: import("@playwright/test").Page, testId: string): Promise<void> {
  await page.evaluate((id) => {
    const root = document.getElementById("nudge-ui-root")?.shadowRoot;
    (root?.querySelector(`[data-test="${id}"]`) as HTMLElement | null)?.click();
  }, testId);
}

async function setRaw(page: import("@playwright/test").Page, property: string, value: string): Promise<void> {
  await page.evaluate(({ property, value }) => {
    const root = document.getElementById("nudge-ui-root")?.shadowRoot;
    const input = root?.querySelector(`[data-test="token-field"][data-property="${property}"] [data-test="raw-input"]`) as HTMLInputElement | null;
    if (!input) throw new Error(`Missing ${property} editor`);
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
  }, { property, value });
}

test("dev: non-forwarding repeated component defaults to source scope and can edit one rendered instance", async ({ page }) => {
  await page.goto("/playground");
  await page.click("text=Repeated 3");

  await expect(page.locator('[data-test="edit-scope"]')).toHaveClass(/status-callout--accent/);
  await expect(page.locator('[data-test="edit-scope"]')).toContainText("Affects 6 elements");
  await expect(page.locator('[data-test="edit-scope"] .scope__linked')).toHaveCSS("justify-content", "space-between");
  await expect(page.locator('[data-test="unlink-element"]')).toHaveClass(/button--quiet/);
  await expect(page.locator('[data-test="unlink-element"]')).toHaveClass(/button--compact/);
  await expect(page.locator('[data-test="unlink-element"]')).toHaveText("Unlink");
  await page.locator('[data-test="unlink-element"]').hover();
  await expect(page.locator('[data-test="unlink-element"]')).toHaveCSS("background-color", "rgba(0, 0, 0, 0.07)");
  await setRaw(page, "font-size", "18px");
  await expect.poll(() => page.locator(".repeated-item").evaluateAll((els) => els.map((el) => getComputedStyle(el).fontSize))).toEqual(Array(6).fill("18px"));
  await shadowClick(page, "unlink-element");

  await expect(page.locator('[data-test="edit-scope"]')).toContainText("Element unlinked");
  await expect(page.locator('[data-test="relink-element"]')).toHaveText("Relink");
  await expect(page.locator('[data-test="edit-scope"] .scope__unlinked')).toHaveCSS("display", "flex");
  expect(await page.locator(".repeated-item[data-instance]").count()).toBe(0);
  await setRaw(page, "font-size", "24px");
  await expect.poll(() => page.locator(".repeated-item").evaluateAll((els) => els.map((el) => getComputedStyle(el).fontSize))).toEqual(["18px", "18px", "24px", "18px", "18px", "18px"]);
  expect(await page.locator(".repeated-item[data-projection-instance]").count()).toBe(1);

  await shadowClick(page, "relink-element");
  expect(await page.locator(".repeated-item[data-projection-instance]").count()).toBe(0);
});
