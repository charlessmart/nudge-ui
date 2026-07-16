import { test, expect } from "@playwright/test";

async function sheetText(page: import("@playwright/test").Page): Promise<string> {
  return await page.evaluate(() => document.getElementById("design-tool-styles")?.textContent ?? "");
}

async function waitForEditors(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(async () => {
      return await page.evaluate(() => {
        const sr = document.getElementById("design-tool-root")?.shadowRoot;
        return !!sr?.querySelector('[data-test="style-editors"]');
      });
    }, { timeout: 5000 })
    .toBe(true);
}

async function setInput(page: import("@playwright/test").Page, property: string, value: string): Promise<void> {
  await page.evaluate(({ p, v }) => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const raw = sr?.querySelector(
      `[data-test="token-field"][data-property="${p}"] [data-test="raw-input"]`,
    ) as HTMLInputElement | null;
    if (!raw) return;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    raw.focus();
    setter.call(raw, v);
    raw.dispatchEvent(new Event("change", { bubbles: true }));
    raw.blur();
  }, { p: property, v: value });
}

async function computedProp(page: import("@playwright/test").Page, prop: string): Promise<string> {
  return await page.evaluate((p) => {
    const btn = document.querySelector(".btn") as HTMLElement | null;
    return btn ? getComputedStyle(btn).getPropertyValue(p) : "";
  }, prop);
}

test("dev: style editors write through the managed stylesheet and update the .btn live", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Save");
  await waitForEditors(page);

  await setInput(page, "padding-top", "24px");
  await expect
    .poll(async () => computedProp(page, "padding-top"), { timeout: 5000 })
    .toBe("24px");

  await setInput(page, "font-size", "18px");
  await expect
    .poll(async () => computedProp(page, "font-size"), { timeout: 5000 })
    .toBe("18px");

  await setInput(page, "border-radius", "12px");
  await expect
    .poll(async () => computedProp(page, "border-radius"), { timeout: 5000 })
    .toBe("12px");

  const tokenValue = await page.evaluate(() => {
    const li = Array.from(document.querySelectorAll('[data-token-name="--color-text-secondary"]'))[0];
    return li?.textContent ?? "";
  });
  const expectedRgb = hexToRgbString(tokenValue);

  const hasColorChip = await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    return Boolean(sr?.querySelector('[data-test="token-field"][data-property="color"] [data-test="token-chip"]'));
  });
  if (hasColorChip) {
    await page.locator('[data-test="token-field"][data-property="color"] [data-test="token-chip"]').click();
  } else {
    await page.evaluate((value) => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const raw = sr?.querySelector(
      '[data-test="token-field"][data-property="color"] [data-test="raw-input"]',
    ) as HTMLInputElement | null;
    if (!raw) throw new Error("Missing color editor");
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    raw.focus();
    setter.call(raw, "");
    raw.dispatchEvent(new Event("input", { bubbles: true }));
  }, "--color-text-secondary");
  }
  await expect
    .poll(async () => page.evaluate((token) => {
      const sr = document.getElementById("design-tool-root")?.shadowRoot;
      return Array.from(sr?.querySelectorAll('[data-test="suggestion-item"]') ?? [])
        .some((item) => item.textContent?.includes(token));
    }, "--color-text-secondary"), { timeout: 5000 })
    .toBe(true);
  await page.evaluate((token) => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    Array.from(sr?.querySelectorAll<HTMLElement>('[data-test="suggestion-item"]') ?? [])
      .find((item) => item.textContent?.includes(token))?.click();
  }, "--color-text-secondary");
  await expect
    .poll(async () => computedProp(page, "color"), { timeout: 5000 })
    .toContain(expectedRgb ?? "102, 102, 102");

  const sheet = await sheetText(page);
  expect(sheet).toContain('[data-cid="Button"]');
  expect(sheet).toContain('[data-src*="src/Button.tsx:32"]');
  expect(sheet).toContain("padding-top: 24px");
  expect(sheet).toContain("font-size: 18px");
  expect(sheet).toContain("border-radius: 12px");
  expect(sheet).toContain("color: var(--color-text-secondary);");
});

test("dev: style editors keep layout and spacing ahead of typography and color", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Save");
  await waitForEditors(page);

  const editorOrder = await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    return Array.from(sr?.querySelectorAll<HTMLElement>('[data-test="style-editors"] > .dt-editor') ?? [])
      .map((editor) => editor.getAttribute("data-test"));
  });

  expect(editorOrder).toEqual([
    "layout-section",
    "spacing-box",
    "typography",
    "color-picker",
    "color-picker",
    "border-editor",
  ]);
});

test("dev: spacing fields split a three-value margin shorthand by side", async ({ page }) => {
  await page.goto("/");
  await page.click(".hero h1");
  await waitForEditors(page);

  await expect(page.locator('[data-test="token-field"][data-property="margin-top"] [data-test="raw-input"]')).toHaveValue("26px");
  await expect(page.locator('[data-test="token-field"][data-property="margin-right"] [data-test="raw-input"]')).toHaveValue("0px");
  await expect(page.locator('[data-test="token-field"][data-property="margin-bottom"] [data-test="raw-input"]')).toHaveValue("22px");
  await expect(page.locator('[data-test="token-field"][data-property="margin-left"] [data-test="raw-input"]')).toHaveValue("0px");
});

function hexToRgbString(raw: string): string | null {
  const match = /#([0-9a-fA-F]{6})/.exec(raw);
  if (!match) return null;
  const hex = match[1]!;
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}
