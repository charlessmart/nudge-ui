import { expect, test } from "@playwright/test";

async function selectCase(page: import("@playwright/test").Page, id: string): Promise<void> {
  const target = page.locator(`[data-test="border-case-${id}"]`);
  await target.evaluate((element) => {
    if (!(element instanceof HTMLElement)) throw new Error("Border case target is not an HTML element");
    element.click();
  });
  await expect(page.locator('[data-test="selection"]')).toHaveAttribute(
    "data-selected-cid",
    `BorderConformance:${id}`,
  );
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();
}

async function setInput(page: import("@playwright/test").Page, property: string, value: string): Promise<void> {
  await page.evaluate(({ property: prop, value: next }) => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    const input = root?.querySelector(
      `[data-test="token-field"][data-property="${prop}"] [data-test="raw-input"]`,
    ) as HTMLInputElement | null;
    if (!input) throw new Error(`Missing border input ${prop}`);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    input.focus();
    setter.call(input, next);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
  }, { property, value });
}

async function computedValue(page: import("@playwright/test").Page, id: string, property: string): Promise<string> {
  return page.locator(`[data-test="border-case-${id}"]`).evaluate((element, prop) => getComputedStyle(element).getPropertyValue(prop), property);
}

test("dev: border conformance gallery renders every shared case and selects a sample", async ({ page }) => {
  await page.goto("/border-conformance");

  const cards = page.locator(".border-case-card");
  await expect(cards).toHaveCount(22);
  await expect(page.locator(".border-conformance-meta")).toContainText("22 shared cases");

  const targets = page.locator(".border-target");
  await expect(targets).toHaveCount(22);
  for (let index = 0; index < await targets.count(); index += 1) {
    const target = targets.nth(index);
    await target.evaluate((element) => {
      if (!(element instanceof HTMLElement)) throw new Error("Border target is not an HTML element");
      element.click();
    });
    const cid = await target.getAttribute("data-cid");
    await expect(page.locator('[data-test="selection"]')).toHaveAttribute("data-selected-cid", cid ?? "");
  }
});

test("dev: border shorthand decomposes into structured fields", async ({ page }) => {
  await page.goto("/border-conformance");
  await selectCase(page, "border-shorthand-literal");

  await expect(page.locator('[data-test="token-field"][data-property="border-width"] [data-test="raw-input"]')).toHaveValue("2px");
  await expect(page.locator('[data-test="border-style"]')).toContainText("Solid");
  await expect(page.locator('[data-test="token-field"][data-property="border-color"] [data-test="raw-input"]')).toHaveValue("#334455");
});

test("dev: border token color renders as token chip", async ({ page }) => {
  await page.goto("/border-conformance");
  await selectCase(page, "border-shorthand-token-color");

  await expect(page.locator('[data-test="token-field"][data-property="border-color"] [data-test="token-chip"]')).toContainText("--color-border");
  await expect(page.locator('[data-test="token-field"][data-property="border-width"] [data-test="raw-input"]')).toHaveValue("1px");
});

test("dev: border side-specific shorthand decomposes correctly", async ({ page }) => {
  await page.goto("/border-conformance");
  await selectCase(page, "border-side-specific");

  await expect(page.locator('[data-test="token-field"][data-property="border-top-width"] [data-test="raw-input"]')).toHaveValue("3px");
  await expect(page.locator('[data-test="border-style-top"]')).toContainText("Dotted");
  await expect(page.locator('[data-test="token-field"][data-property="border-top-color"] [data-test="token-chip"]')).toContainText("--color-accent");
});

test("dev: incomplete border shorthand decomposes with CSS initials", async ({ page }) => {
  await page.goto("/border-conformance");
  await selectCase(page, "border-incomplete-shorthand");

  await expect(page.locator('[data-test="token-field"][data-property="border-width"] [data-test="raw-input"]')).toHaveValue("2px");
  await expect(page.locator('[data-test="border-style"]')).toContainText("Solid");
  await expect(page.locator('[data-test="token-field"][data-property="border-color"] [data-test="raw-input"]')).toHaveValue("currentcolor");
});

test("dev: border none exposes style and hides width/color until drawn", async ({ page }) => {
  await page.goto("/border-conformance");
  await selectCase(page, "border-none-style");

  await expect(page.locator('[data-test="border-style"]')).toContainText("None");
  await expect(page.locator('[data-test="token-field"][data-property="border-width"]')).toHaveCount(0);
  await expect(page.locator('[data-test="token-field"][data-property="border-color"]')).toHaveCount(0);
});

test("dev: all-sides-different expands individual side fields by default", async ({ page }) => {
  await page.goto("/border-conformance");
  await selectCase(page, "border-all-sides-different");

  await expect(page.locator('.dt-border')).toHaveAttribute("data-expanded", "true");
  await expect(page.locator('[data-test="token-field"][data-property="border-top-width"] [data-test="raw-input"]')).toHaveValue("1px");
  await expect(page.locator('[data-test="token-field"][data-property="border-left-width"] [data-test="raw-input"]')).toHaveValue("4px");
  await expect(page.locator('[data-test="border-style-right"]')).toContainText("Dotted");
});

test("dev: order-permuted shorthand shows literal hex color not a token chip", async ({ page }) => {
  await page.goto("/border-conformance");
  await selectCase(page, "border-shorthand-order-permutation");

  await expect(page.locator('[data-test="token-field"][data-property="border-width"] [data-test="raw-input"]')).toHaveValue("3px");
  await expect(page.locator('[data-test="border-style"]')).toContainText("Double");
  await expect(page.locator('[data-test="token-field"][data-property="border-color"] [data-test="raw-input"]')).toHaveValue("#9b4dca");
  await expect(page.locator('[data-test="token-field"][data-property="border-color"] [data-test="token-chip"]')).toHaveCount(0);
});

test("dev: border hidden exposes style control", async ({ page }) => {
  await page.goto("/border-conformance");
  await selectCase(page, "border-hidden-style");

  await expect(page.locator('[data-test="border-style"]')).toContainText("Hidden");
  await expect(page.locator('[data-test="token-field"][data-property="border-width"]')).toHaveCount(0);
});

test("dev: border radius token is editable as atomic", async ({ page }) => {
  await page.goto("/border-conformance");
  await selectCase(page, "border-radius-token");

  await expect(page.locator('[data-test="token-field"][data-property="border-radius"] [data-test="token-chip"]')).toContainText("--space-3");

  await page.goto("/border-conformance");
  await selectCase(page, "border-radius-atomic");
  await expect(page.locator('[data-test="token-field"][data-property="border-radius"] [data-test="raw-input"]')).toHaveValue("8px");
  await setInput(page, "border-radius", "16px");
  await expect.poll(() => computedValue(page, "border-radius-atomic", "border-top-left-radius")).toBe("16px");
});

test("dev: border longhands edit produces managed stylesheet updates", async ({ page }) => {
  await page.goto("/border-conformance");
  await selectCase(page, "border-top-width-longhand");

  await expect(page.locator('[data-test="token-field"][data-property="border-top-width"] [data-test="raw-input"]')).toHaveValue("5px");
  await setInput(page, "border-top-width", "10px");
  await expect.poll(() => computedValue(page, "border-top-width-longhand", "border-top-width")).toBe("10px");
  await expect.poll(async () => page.evaluate(() => document.getElementById("design-tool-styles")?.textContent ?? ""))
    .toContain("border-top-width: 10px;");
  await expect(page.locator('[data-test="border-case-border-top-width-longhand"]')).not.toHaveAttribute("style", /.*/);
});

test("dev: all four side-specific borders render and are selectable", async ({ page }) => {
  await page.goto("/border-conformance");
  await selectCase(page, "border-all-sides-different");

  await expect(page.locator('[data-test="token-field"][data-property="border-top-width"] [data-test="raw-input"]')).toHaveValue("1px");
  await expect(page.locator('[data-test="border-style-right"]')).toContainText("Dotted");
  await expect(page.locator('[data-test="token-field"][data-property="border-bottom-color"] [data-test="raw-input"]')).toHaveValue("blue");
  await expect(page.locator('[data-test="token-field"][data-property="border-left-width"] [data-test="raw-input"]')).toHaveValue("4px");
});
