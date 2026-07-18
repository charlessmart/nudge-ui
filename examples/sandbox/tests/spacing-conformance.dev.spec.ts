import { expect, test } from "@playwright/test";

async function selectCase(page: import("@playwright/test").Page, id: string): Promise<void> {
  const target = page.locator(`[data-test="spacing-case-${id}"]`);
  await target.click();
  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    return root?.querySelector('[data-test="selection"]')?.textContent ?? "";
  })).toContain(`SpacingConformance:${id}`);
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();
}

async function setInput(page: import("@playwright/test").Page, property: string, value: string): Promise<void> {
  await page.evaluate(({ property: prop, value: next }) => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    const input = root?.querySelector(
      `[data-test="token-field"][data-property="${prop}"] [data-test="raw-input"]`,
    ) as HTMLInputElement | null;
    if (!input) throw new Error(`Missing spacing input ${prop}`);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    input.focus();
    setter.call(input, next);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
  }, { property, value });
}

async function computedSpacing(page: import("@playwright/test").Page, id: string, property: string): Promise<string> {
  return page.locator(`[data-test="spacing-case-${id}"]`).evaluate((element, prop) => getComputedStyle(element).getPropertyValue(prop), property);
}

test("dev: spacing conformance gallery renders every shared case and selects a sample", async ({ page }) => {
  await page.goto("/spacing-conformance");

  const cards = page.locator(".spacing-case-card");
  await expect(cards).toHaveCount(24);
  await expect(page.locator(".spacing-conformance-meta")).toContainText("24 shared cases");

  const targets = page.locator(".spacing-target");
  await expect(targets).toHaveCount(24);
  for (let index = 0; index < await targets.count(); index += 1) {
    const target = targets.nth(index);
    await target.click();
    const cid = await target.getAttribute("data-cid");
    await expect.poll(async () => page.evaluate(() => {
      const root = document.getElementById("design-tool-root")?.shadowRoot;
      return root?.querySelector('[data-test="selection"]')?.textContent ?? "";
    })).toContain(cid ?? "");
  }
});

test("dev: spacing gallery edits a grouped pair", async ({ page }) => {
  await page.goto("/spacing-conformance");
  await selectCase(page, "spacing-physical-one-value-literal");
  await expect(page.locator('[data-test="token-field"][data-property="margin-horizontal"] [data-test="raw-input"]')).toHaveValue("12px");
  await setInput(page, "margin-horizontal", "20px");
  await expect.poll(() => computedSpacing(page, "spacing-physical-one-value-literal", "margin-left")).toBe("20px");
  await expect.poll(() => computedSpacing(page, "spacing-physical-one-value-literal", "margin-right")).toBe("20px");
});

test("dev: spacing gallery preserves token and raw editing values", async ({ page }) => {
  await page.goto("/spacing-conformance");
  await selectCase(page, "spacing-logical-token");
  await expect(page.locator('[data-test="token-field"][data-property="padding-horizontal"] [data-test="token-chip"]')).toContainText("--space-4");

  await page.goto("/spacing-conformance");
  await selectCase(page, "spacing-token-calc");
  await expect(page.locator('[data-test="token-field"][data-property="padding-horizontal"] [data-test="raw-input"]')).toHaveValue("calc(var(--space-4) * 2)");
  await setInput(page, "padding-horizontal", "calc(4px * 3)");
  await expect.poll(() => computedSpacing(page, "spacing-token-calc", "padding-left")).toBe("12px");
});
