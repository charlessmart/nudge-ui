import { expect, test } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";

async function waitForEditors(page: import("@playwright/test").Page): Promise<void> {
  await expect.poll(async () => page.evaluate(() => Boolean(
    document.getElementById("nudge-ui-root")?.shadowRoot?.querySelector('[data-test="style-editors"]'),
  ))).toBe(true);
}

async function setInput(page: import("@playwright/test").Page, property: string, value: string): Promise<void> {
  const input = page.locator(
    `[data-test="token-field"][data-property="${property}"] [data-test="raw-input"]`,
  );
  await input.fill(value);
  await input.blur();
}

async function setOpacityInput(page: import("@playwright/test").Page, property: string, value: string): Promise<void> {
  const input = page.locator(
    `[data-test="token-field"][data-property="${property}"] [data-test="color-opacity-input"]`,
  );
  await input.fill(value);
  await input.blur();
}

test("dev: color conformance gallery renders every shared case and exposes authored values", async ({ page }) => {
  await page.goto("/color-conformance");

  await expect(page.locator(".color-case")).toHaveCount(23);
  await expect(page.locator(".color-conformance-hero__support")).toContainText("23 shared cases");

  await page.locator('[data-test="color-case-color-named-keywords"]').click();
  await waitForEditors(page);
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="raw-input"]')).toHaveValue("red");
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="raw-input"]')).toHaveValue("linen");
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="color-opacity-input"]')).toHaveValue("100%");
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="color-opacity-input"]')).toHaveValue("100%");
});

test("dev: color hex values retain their color meaning through CSSOM serialization", async ({ page }) => {
  await page.goto("/color-conformance");

  await page.locator('[data-test="color-case-color-hex-six-digit"]').click();
  await waitForEditors(page);
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="raw-input"]'))
    .toHaveValue("rgb(26, 26, 46)");
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="raw-input"]'))
    .toHaveValue("rgb(255, 255, 255)");
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="color-opacity-input"]'))
    .toHaveValue("100%");
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="color-opacity-input"]'))
    .toHaveValue("100%");

  await page.locator('[data-test="color-case-color-hex-alpha-eight"]').click();
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="raw-input"]'))
    .toHaveValue(/^rgba\(/);
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="color-opacity-input"]'))
    .toHaveValue("53.3%");
});

test("dev: rgb and hsl retain color functions and opacity through CSSOM serialization", async ({ page }) => {
  await page.goto("/color-conformance");

  await page.locator('[data-test="color-case-color-rgb-legacy"]').click();
  await waitForEditors(page);
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="raw-input"]'))
    .toHaveValue(/^rgb\(/);
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="color-opacity-input"]'))
    .toHaveValue("100%");
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="raw-input"]'))
    .toHaveValue(/^rgba\(/);
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="color-opacity-input"]'))
    .toHaveValue("80%");

  await page.locator('[data-test="color-case-color-hsl-modern"]').click();
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="raw-input"]'))
    .toHaveValue(/^rgb\(/);
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="color-opacity-input"]'))
    .toHaveValue("80%");
});

test("dev: modern color spaces render in the inspector after CSSOM normalization", async ({ page }) => {
  await page.goto("/color-conformance");

  await page.locator('[data-test="color-case-color-oklch"]').click();
  await waitForEditors(page);
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="raw-input"]'))
    .toHaveValue(/^oklch\(/);
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="raw-input"]'))
    .toHaveValue(/^oklch\(/);
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="color-opacity-input"]'))
    .toHaveValue("100%");
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="color-opacity-input"]'))
    .toHaveValue("100%");
});

test("dev: transparent and currentColor remain meaningful declared values", async ({ page }) => {
  await page.goto("/color-conformance");

  await page.locator('[data-test="color-case-color-transparent-currentcolor"]').click();
  await waitForEditors(page);
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="raw-input"]'))
    .toHaveValue("transparent");
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="raw-input"]'))
    .toHaveValue(/^currentcolor$/i);
});

test("dev: color fixture tokens render as chips with type suggestions", async ({ page }) => {
  await page.goto("/color-conformance");
  await page.locator('[data-test="color-case-color-token-simple"]').click();
  await waitForEditors(page);

  await expect.poll(async () => page.evaluate(() => {
    const catalog = (window as unknown as { __designTokenCatalog?: { cssName: string }[] }).__designTokenCatalog ?? [];
    return catalog.some((token) => token.cssName === "--content-secondary");
  })).toBe(true);

  const fg = page.locator('[data-test="token-field"][data-property="color"]');
  await expect(fg.locator('[data-test="token-chip"]')).toContainText("--color-text-primary");
  await expect(fg.locator('[data-test="color-opacity-input"]')).toHaveValue("100%");
  await fg.locator('[data-test="token-chip"]').click();
  await expect(page.getByRole("option", { name: /--color-surface-raised/ })).toBeVisible();

  const bg = page.locator('[data-test="token-field"][data-property="background-color"]');
  await expect(bg.locator('[data-test="token-chip"]')).toContainText("--color-surface-raised");
  await expect(bg.locator('[data-test="color-opacity-input"]')).toHaveValue("100%");

  await setOpacityInput(page, "color", "50%");
  await expect.poll(() => managedSheetText(page))
    .toContain("color: color-mix(in srgb, var(--color-text-primary) 50%, transparent);");
});

test("dev: picker offers a concrete-color peer with an unfamiliar token name", async ({ page }) => {
  await page.goto("/color-conformance");
  await page.locator('[data-test="color-case-color-token-simple"]').click();
  await waitForEditors(page);

  const fg = page.locator('[data-test="token-field"][data-property="color"]');
  await expect(fg.locator('[data-test="token-chip"]')).toContainText("--color-text-primary");
  await fg.locator('[data-test="token-chip"]').click();
  const peer = page.getByRole("option", { name: /^--content-secondary/ });
  await expect(peer).toBeVisible();
  await peer.click();

  await expect.poll(() => managedSheetText(page))
    .toContain("color: var(--content-secondary);");
});

test("dev: color token fallback keeps the fallback in the authored expression", async ({ page }) => {
  await page.goto("/color-conformance");
  await page.locator('[data-test="color-case-color-token-fallback"]').click();
  await waitForEditors(page);

  const fg = page.locator('[data-test="token-field"][data-property="color"]');
  await expect(fg.locator('[data-test="token-chip"]')).toContainText("--color-text-secondary");
  await expect(fg.locator('[data-test="raw-input"]')).toHaveCount(0);

  const bg = page.locator('[data-test="token-field"][data-property="background-color"]');
  await expect(bg.locator('[data-test="token-chip"]')).toContainText("--color-surface-sunken");
});

test("dev: unknown tokens surface the raw expression without token chips", async ({ page }) => {
  await page.goto("/color-conformance");
  await page.locator('[data-test="color-case-color-token-unknown-fallback"]').click();
  await waitForEditors(page);

  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="raw-input"]'))
    .toHaveValue("var(--unknown-color, hotpink)");
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="raw-input"]'))
    .toHaveValue("var(--unknown-bg, transparent)");
});

test("dev: separable color-mix tokens render as a chip with opacity", async ({ page }) => {
  await page.goto("/color-conformance");
  await page.locator('[data-test="color-case-color-mix-token"]').click();
  await waitForEditors(page);

  const fg = page.locator('[data-test="token-field"][data-property="color"]');
  await expect(fg.locator('[data-test="token-chip"]')).toContainText("--color-primary");
  await expect(fg.locator('[data-test="raw-input"]')).toHaveCount(0);
  await expect(fg.locator('[data-test="color-opacity-input"]')).toHaveValue("50%");

  const bg = page.locator('[data-test="token-field"][data-property="background-color"]');
  await expect(bg.locator('[data-test="raw-input"]'))
    .toHaveValue("color-mix(in srgb, var(--color-primary) 10%, white)");
  await expect(bg.locator('[data-test="color-opacity-input"]')).toHaveCount(0);
  await expect(bg.locator('[data-test="token-chip"]')).toHaveCount(0);
});

test("dev: opacity tokens stay separate from the color token chrome", async ({ page }) => {
  await page.goto("/color-conformance");
  await page.locator('[data-test="color-case-color-opacity-token"]').click();
  await waitForEditors(page);

  const fg = page.locator('[data-test="token-field"][data-property="color"]');
  await expect(fg.locator('[data-test="color-opacity-input"]')).toHaveValue("35%");
  await expect(fg.locator('[data-test="token-chip"]')).toContainText("--color-primary");

  const bg = page.locator('[data-test="token-field"][data-property="background-color"]');
  await expect(bg.locator('[data-test="color-opacity-input"]')).toHaveValue("35%");
  await expect(bg.locator('[data-test="token-chip"]')).toHaveCount(0);

  await setOpacityInput(page, "color", "60%");
  await expect.poll(() => managedSheetText(page))
    .toContain("color-mix(in srgb, var(--color-primary) 60%, transparent)");
});

test("dev: literal opacity edits preserve the color format", async ({ page }) => {
  await page.goto("/color-conformance");

  const hex = page.locator('[data-test="color-case-color-hex-alpha-eight"]');
  await hex.click();
  await waitForEditors(page);
  await setOpacityInput(page, "color", "25%");
  await expect.poll(() => managedSheetText(page))
    .toContain("color: rgba(255, 0, 0, 0.25);");

  const rgb = page.locator('[data-test="color-case-color-rgb-legacy"]');
  await rgb.click();
  await waitForEditors(page);
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="raw-input"]'))
    .toHaveValue(/^rgba\(/);
  await setOpacityInput(page, "background-color", "50%");
  await expect.poll(() => managedSheetText(page))
    .toContain("background-color: rgba(0, 0, 0, 0.5);");
});

test("dev: opacity fields nudge by one percent or ten percent with Shift", async ({ page }) => {
  await page.goto("/color-conformance");
  await page.locator('[data-test="color-case-color-rgb-legacy"]').click();
  await waitForEditors(page);

  const opacity = page.locator(
    '[data-test="token-field"][data-property="background-color"] [data-test="color-opacity-input"]',
  );
  await expect(opacity).toHaveValue("80%");
  await opacity.press("ArrowUp");
  await expect(opacity).toHaveValue("81%");
  await opacity.press("Shift+ArrowDown");
  await expect(opacity).toHaveValue("71%");
});

test("dev: color swatches are present on color-capable fields", async ({ page }) => {
  await page.goto("/color-conformance");
  await page.locator('[data-test="color-case-color-hex-six-digit"]').click();
  await waitForEditors(page);

  const fg = page.locator('[data-test="token-field"][data-property="color"]');
  await expect(fg.locator('[data-test="token-color-swatch"]')).toHaveCount(1);
  await expect(fg.locator('[data-test="token-color-input"]')).toHaveCount(1);

  const bg = page.locator('[data-test="token-field"][data-property="background-color"]');
  await expect(bg.locator('[data-test="token-color-swatch"]')).toHaveCount(1);
});

test("dev: color swatches are centered in raw fields and token chips", async ({ page }) => {
  const cases = [
    { id: "color-hex-six-digit", property: "color" },
    { id: "color-token-simple", property: "color" },
  ] as const;

  for (const { id, property } of cases) {
    await page.goto("/color-conformance");
    await page.locator(`[data-test="color-case-${id}"]`).click();
    await waitForEditors(page);

    const field = page.locator(`[data-test="token-field"][data-property="${property}"]`);
    const control = field.locator(".token-color-control");
    const swatch = field.locator('[data-test="token-color-swatch"]');
    await expect(swatch).toHaveCount(1);
    await expect(swatch).toBeVisible();
    const controlBox = await control.boundingBox();
    const swatchBox = await swatch.boundingBox();

    expect(controlBox).not.toBeNull();
    expect(swatchBox).not.toBeNull();
    const controlCenter = controlBox!.x + controlBox!.width / 2;
    const swatchCenter = swatchBox!.x + swatchBox!.width / 2;
    expect(Math.abs(controlCenter - swatchCenter)).toBeLessThan(0.01);
  }
});

test("dev: browser-supported oklch values render in color swatches", async ({ page }) => {
  await page.goto("/color-conformance");
  await page.locator('[data-test="color-case-color-oklch"]').click();
  await waitForEditors(page);

  const swatch = page.locator('[data-test="token-field"][data-property="color"] [data-test="token-color-swatch"]');
  await expect(swatch.locator("..")).toHaveAttribute("data-resolved", "true");
  await expect(swatch).toHaveCSS("background-image", "none");
});

test("dev: color value edits round-trip through the managed stylesheet", async ({ page }) => {
  await page.goto("/color-conformance");

  const hex = page.locator('[data-test="color-case-color-hex-six-digit"]');
  await hex.click();
  await waitForEditors(page);
  await setInput(page, "color", "#ef4444");

  await expect.poll(async () => hex.evaluate((element) => getComputedStyle(element).color))
    .toBe("rgb(239, 68, 68)");
  await expect.poll(() => managedSheetText(page))
    .toContain("color: rgb(239, 68, 68);");
  await expect(hex).not.toHaveAttribute("style", /.*/);
});

test("dev: token alias chain resolves correctly", async ({ page }) => {
  await page.goto("/color-conformance");
  await page.locator('[data-test="color-case-color-token-alias-chain"]').click();
  await waitForEditors(page);

  const fg = page.locator('[data-test="token-field"][data-property="color"]');
  await expect(fg.locator('[data-test="token-chip"]')).toContainText("--color-error");
  await expect(fg.locator('[data-test="token-color-swatch"]')).toHaveAttribute("style", /--swatch-color:\s*#dc2626/);
  await fg.locator('[data-test="token-chip"]').click();
  await expect(page.getByRole("option", { name: "--color-danger #dc2626" })).toBeVisible();
});

test("dev: inherited local color tokens remain attributable", async ({ page }) => {
  await page.goto("/color-conformance");
  await page.locator('[data-test="color-case-color-token-bg-only"]').click();
  await waitForEditors(page);

  const fg = page.locator('[data-test="token-field"][data-property="color"]');
  await expect(fg.locator('[data-test="token-chip"]')).toContainText("--color-ink");
  await expect(fg.locator('[data-test="token-color-swatch"]')).toHaveAttribute("style", /--swatch-color:\s*#1a1a2e/);
});
