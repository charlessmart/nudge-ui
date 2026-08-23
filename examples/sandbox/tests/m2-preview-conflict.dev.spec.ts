import { expect, test } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";

test("dev: a blocked managed preview remains visible in the change log", async ({ page }) => {
  await page.goto("/playground");
  await page.addStyleTag({ content: ".btn { font-size: 13px !important; }" });
  await page.click("text=Save");

  await page.evaluate(() => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    const input = root?.querySelector(
      '[data-test="token-field"][data-property="font-size"] [data-test="raw-input"]',
    ) as HTMLInputElement | null;
    if (!input) throw new Error("Missing font-size editor");
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "22px");
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
  });

  await expect.poll(() => page.locator(".btn").evaluate((el) => getComputedStyle(el).fontSize)).toBe("13px");
  await expect.poll(() => page.evaluate(() => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    return root?.querySelector('[data-test="preview-conflict"]')?.textContent ?? "";
  })).toContain("important");

  await expect
    .poll(async () => managedSheetText(page), { timeout: 5000 })
    .toContain("font-size: 22px");
  await expect
    .poll(async () => managedSheetText(page), { timeout: 5000 })
    .not.toContain("!important");
});
