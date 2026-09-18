import { expect, test } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";
import { openEditor } from "@nudge-ui/compatibility/playwright";

test("dev: a blocked managed preview remains visible in the change log", async ({ page }) => {
  const app = await openEditor(page, "/playground");
  await app.locator("head").evaluate((head) => {
    const style = document.createElement("style");
    style.textContent = ".btn { font-size: 13px !important; }";
    head.append(style);
  });
  await app.getByRole("button", { name: "Save" }).click();

  await page.evaluate(() => {
    const root = document.getElementById("nudge-ui-root")?.shadowRoot;
    const input = root?.querySelector(
      '[data-test="token-field"][data-property="font-size"] [data-test="raw-input"]',
    ) as HTMLInputElement | null;
    if (!input) throw new Error("Missing font-size editor");
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "22px");
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
  });

  await expect.poll(() => app.locator(".btn").evaluate((el) => getComputedStyle(el).fontSize)).toBe("13px");
  await expect.poll(() => page.evaluate(() => {
    const root = document.getElementById("nudge-ui-root")?.shadowRoot;
    return root?.querySelector('[data-test="preview-conflict"]')?.textContent ?? "";
  })).toContain("important");

  await expect
    .poll(async () => managedSheetText(page), { timeout: 5000 })
    .toContain("font-size: 22px");
  await expect
    .poll(async () => managedSheetText(page), { timeout: 5000 })
    .not.toContain("!important");
});
