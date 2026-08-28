import { expect, test } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";

async function waitForEditors(page: import("@playwright/test").Page): Promise<void> {
  await expect.poll(async () => page.evaluate(() => Boolean(
    document.getElementById("nudge-ui-root")?.shadowRoot?.querySelector('[data-test="style-editors"]'),
  ))).toBe(true);
}

async function setInput(page: import("@playwright/test").Page, property: string, value: string): Promise<void> {
  await page.evaluate(({ p, v }) => {
    const root = document.getElementById("nudge-ui-root")?.shadowRoot;
    const input = root?.querySelector(
      `[data-test="token-field"][data-property="${p}"] [data-test="raw-input"]`,
    ) as HTMLInputElement | null;
    if (!input) throw new Error(`Missing typography input: ${p}`);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    input.focus();
    setter.call(input, v);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
  }, { p: property, v: value });
}

test("dev: typography conformance gallery exposes CSSOM-declared values", async ({ page }) => {
  await page.goto("/typography-conformance");

  await expect(page.locator(".typography-case")).toHaveCount(7);
  await expect(page.locator(".typography-conformance-hero__support")).toContainText("7 shared cases");

  await page.locator('[data-test="typography-case-type-direct-literals"]').click();
  await waitForEditors(page);
  await expect(page.locator('[data-test="token-field"][data-property="font-size"] [data-test="raw-input"]')).toHaveValue("0.875rem");
  await expect(page.locator('[data-test="font-style-field"]')).toContainText("650");
  await expect(page.locator('[data-test="token-field"][data-property="line-height"] [data-test="raw-input"]')).toHaveValue("1.45");
  await expect(page.locator('[data-test="token-field"][data-property="letter-spacing"] [data-test="raw-input"]')).toHaveValue("-0.0125em");
  await expect(page.locator('[data-test="token-field"][data-property="font-family"] [data-test="raw-input"]')).toHaveValue('"Aster Display"');
});

test("dev: font shorthand omissions reset earlier longhands", async ({ page }) => {
  await page.goto("/typography-conformance");

  const shorthand = page.locator('[data-test="typography-case-type-font-shorthand-resets"]');
  await shorthand.click();
  await waitForEditors(page);

  await expect(page.locator('[data-test="font-style-field"]')).toContainText("Regular");
  await expect(page.locator('[data-test="token-field"][data-property="line-height"] [data-test="raw-input"]'))
    .toHaveValue("normal");
  await expect(page.locator('[data-test="token-field"][data-property="font-size"] [data-test="raw-input"]'))
    .toHaveValue("16px");
  await expect(shorthand).toHaveCSS("font-style", "normal");
  await expect(shorthand).toHaveCSS("font-weight", "400");
  await expect(shorthand).toHaveCSS("line-height", "normal");
});

test("dev: typography fixture tokens render as chips with type suggestions", async ({ page }) => {
  await page.goto("/typography-conformance");
  await page.locator('[data-test="typography-case-type-tokenized-longhands"]').click();
  await waitForEditors(page);

  const size = page.locator('[data-test="token-field"][data-property="font-size"]');
  await expect(size.locator('input[aria-hidden="true"]')).toHaveValue("--type-size-body");
  await size.locator('[data-test="token-chip"]').click();
  await expect(page.getByRole("option", { name: /--type-size-body/ })).toBeVisible();

  await page.locator('[data-test="typography-case-type-var-fallback-family"]').click();
  const family = page.locator('[data-test="token-field"][data-property="font-family"]');
  await expect(family.locator('[data-test="token-chip"]')).toContainText("--type-family-body");
  await expect(family.locator('[data-test="raw-input"]')).toHaveCount(0);
});

test("dev: typography raw expressions remain editable after CSSOM normalization", async ({ page }) => {
  await page.goto("/typography-conformance");

  const functional = page.locator('[data-test="typography-case-type-functional-raw"]');
  await functional.click();
  await waitForEditors(page);
  await expect(page.locator('[data-test="token-field"][data-property="font-size"] [data-test="raw-input"]'))
    .toHaveValue("clamp(1rem, 0.78rem + 1vw, 1.35rem)");
  await expect(page.locator('[data-test="token-field"][data-property="line-height"] [data-test="raw-input"]'))
    .toHaveValue("calc(1em + 0.5rem)");

  const shorthand = page.locator('[data-test="typography-case-type-font-shorthand"]');
  await shorthand.click();
  await expect(page.locator('[data-test="token-field"][data-property="font-size"] [data-test="raw-input"]')).toHaveValue("1.25rem");
  await setInput(page, "font-size", "24px");

  await expect.poll(async () => shorthand.evaluate((element) => getComputedStyle(element).fontSize)).toBe("24px");
  await expect.poll(() => managedSheetText(page))
    .toContain("font-size: 24px;");
  await expect(shorthand).not.toHaveAttribute("style", /.*/);
});
