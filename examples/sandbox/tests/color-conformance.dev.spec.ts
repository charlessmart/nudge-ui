import { expect, test } from "@playwright/test";

async function waitForEditors(page: import("@playwright/test").Page): Promise<void> {
  await expect.poll(async () => page.evaluate(() => Boolean(
    document.getElementById("design-tool-root")?.shadowRoot?.querySelector('[data-test="style-editors"]'),
  ))).toBe(true);
}

async function setInput(page: import("@playwright/test").Page, property: string, value: string): Promise<void> {
  await page.evaluate(({ p, v }) => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    const input = root?.querySelector(
      `[data-test="token-field"][data-property="${p}"] [data-test="raw-input"]`,
    ) as HTMLInputElement | null;
    if (!input) throw new Error(`Missing color input: ${p}`);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    input.focus();
    setter.call(input, v);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
  }, { p: property, v: value });
}

async function setOpacityInput(page: import("@playwright/test").Page, property: string, value: string): Promise<void> {
  await page.evaluate(({ p, v }) => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    const input = root?.querySelector(
      `[data-test="token-field"][data-property="${p}"] [data-test="color-opacity-input"]`,
    ) as HTMLInputElement | null;
    if (!input) throw new Error(`Missing opacity input: ${p}`);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    input.focus();
    setter.call(input, v);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
  }, { p: property, v: value });
}

test("dev: color conformance gallery renders every shared case and exposes authored values", async ({ page }) => {
  await page.goto("/color-conformance");

  await expect(page.locator(".color-case")).toHaveCount(23);
  await expect(page.locator(".color-conformance-hero__support")).toContainText("23 shared cases");

  await page.locator('[data-test="color-case-color-named-keywords"]').click();
  await waitForEditors(page);
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="raw-input"]')).toHaveValue("red");
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="raw-input"]')).toHaveValue("linen");
});

test("dev: color hex values are authored exactly, not canonicalised", async ({ page }) => {
  await page.goto("/color-conformance");

  await page.locator('[data-test="color-case-color-hex-six-digit"]').click();
  await waitForEditors(page);
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="raw-input"]'))
    .toHaveValue("#1a1a2e");
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="raw-input"]'))
    .toHaveValue("#ffffff");

  await page.locator('[data-test="color-case-color-hex-alpha-eight"]').click();
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="raw-input"]'))
    .toHaveValue("#ff000088");
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="color-opacity-input"]'))
    .toHaveValue("53.3333%");
});

test("dev: rgb and hsl preserve authored form", async ({ page }) => {
  await page.goto("/color-conformance");

  await page.locator('[data-test="color-case-color-rgb-legacy"]').click();
  await waitForEditors(page);
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="raw-input"]'))
    .toHaveValue("rgb(255, 0, 0)");
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="raw-input"]'))
    .toHaveValue("rgba(0, 0, 0, 0.8)");
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="color-opacity-input"]'))
    .toHaveValue("80%");

  await page.locator('[data-test="color-case-color-hsl-modern"]').click();
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="raw-input"]'))
    .toHaveValue("hsl(0 100% 50% / 80%)");
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="color-opacity-input"]'))
    .toHaveValue("80%");
});

test("dev: modern color spaces render in the inspector", async ({ page }) => {
  await page.goto("/color-conformance");

  await page.locator('[data-test="color-case-color-oklch"]').click();
  await waitForEditors(page);
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="raw-input"]'))
    .toHaveValue("oklch(63% .2 25)");
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="raw-input"]'))
    .toHaveValue("oklch(95% .01 100)");
});

test("dev: transparent and currentColor show as authored", async ({ page }) => {
  await page.goto("/color-conformance");

  await page.locator('[data-test="color-case-color-transparent-currentcolor"]').click();
  await waitForEditors(page);
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="raw-input"]'))
    .toHaveValue("transparent");
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="raw-input"]'))
    .toHaveValue("currentColor");
});

test("dev: color fixture tokens render as chips with type suggestions", async ({ page }) => {
  await page.goto("/color-conformance");
  await page.locator('[data-test="color-case-color-token-simple"]').click();
  await waitForEditors(page);

  const fg = page.locator('[data-test="token-field"][data-property="color"]');
  await expect(fg.locator('[data-test="token-chip"]')).toContainText("--color-text-primary");
  await fg.locator('[data-test="token-chip"]').click();
  await expect(page.getByRole("option", { name: /--color-surface-raised/ })).toBeVisible();

  const bg = page.locator('[data-test="token-field"][data-property="background-color"]');
  await expect(bg.locator('[data-test="token-chip"]')).toContainText("--color-surface-raised");
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

test("dev: color-mix expressions preserve full authored value with tokens", async ({ page }) => {
  await page.goto("/color-conformance");
  await page.locator('[data-test="color-case-color-mix-token"]').click();
  await waitForEditors(page);

  const fg = page.locator('[data-test="token-field"][data-property="color"]');
  await expect(fg.locator('[data-test="raw-input"]'))
    .toHaveValue("color-mix(in oklab, var(--color-primary) 50%, transparent)");
  await expect(fg.locator('[data-test="color-opacity-input"]')).toHaveValue("50%");
  await expect(fg.locator('[data-test="token-attribution"]')).toContainText("--color-primary");
  await expect(fg.locator('[data-test="token-chip"]')).toHaveCount(0);

  const bg = page.locator('[data-test="token-field"][data-property="background-color"]');
  await expect(bg.locator('[data-test="raw-input"]'))
    .toHaveValue("color-mix(in srgb, var(--color-primary) 10%, white)");
  await expect(bg.locator('[data-test="color-opacity-input"]')).toHaveCount(0);
  await expect(bg.locator('[data-test="token-attribution"]')).toContainText("--color-primary");
  await expect(bg.locator('[data-test="token-chip"]')).toHaveCount(0);
});

test("dev: opacity tokens populate the resolved opacity field without token chrome", async ({ page }) => {
  await page.goto("/color-conformance");
  await page.locator('[data-test="color-case-color-opacity-token"]').click();
  await waitForEditors(page);

  const fg = page.locator('[data-test="token-field"][data-property="color"]');
  await expect(fg.locator('[data-test="color-opacity-input"]')).toHaveValue("35%");
  await expect(fg.locator('[data-test="token-attribution"]')).toContainText("--color-primary");
  await expect(fg.locator('[data-test="token-attribution"]')).not.toContainText("--opacity-muted");
  await expect(fg.locator('[data-test="token-chip"]')).toHaveCount(0);

  const bg = page.locator('[data-test="token-field"][data-property="background-color"]');
  await expect(bg.locator('[data-test="color-opacity-input"]')).toHaveValue("35%");
  await expect(bg.locator('[data-test="token-attribution"]')).toHaveCount(0);
  await expect(bg.locator('[data-test="token-chip"]')).toHaveCount(0);

  await setOpacityInput(page, "color", "60%");
  await expect.poll(async () => page.evaluate(() => document.getElementById("design-tool-styles")?.textContent ?? ""))
    .toContain("color-mix(in srgb, var(--color-primary) 60%, transparent)");
});

test("dev: literal opacity edits preserve the color format", async ({ page }) => {
  await page.goto("/color-conformance");

  const hex = page.locator('[data-test="color-case-color-hex-alpha-eight"]');
  await hex.click();
  await waitForEditors(page);
  await setOpacityInput(page, "color", "25%");
  await expect.poll(async () => page.evaluate(() => document.getElementById("design-tool-styles")?.textContent ?? ""))
    .toContain("color: #ff000040;");

  const rgb = page.locator('[data-test="color-case-color-rgb-legacy"]');
  await rgb.click();
  await waitForEditors(page);
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="raw-input"]'))
    .toHaveValue("rgba(0, 0, 0, 0.8)");
  await setOpacityInput(page, "background-color", "50%");
  await expect.poll(async () => page.evaluate(() => document.getElementById("design-tool-styles")?.textContent ?? ""))
    .toContain("background-color: rgba(0, 0, 0, 50%);");
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

test("dev: browser-supported oklch values render in color swatches", async ({ page }) => {
  await page.goto("/color-conformance");
  await page.locator('[data-test="color-case-color-oklch"]').click();
  await waitForEditors(page);

  const swatch = page.locator('[data-test="token-field"][data-property="color"] [data-test="token-color-swatch"]');
  await expect(swatch.locator("..")).toHaveAttribute("data-resolved", "true");
  await expect(swatch).toHaveCSS("background-image", "none");
});

test("dev: fill and stroke fields render as color-capable", async ({ page }) => {
  await page.goto("/color-conformance");
  await page.locator('[data-test="color-case-color-fill-and-stroke"]').click();
  await waitForEditors(page);

  await expect(page.locator('[data-test="token-field"][data-property="fill"] [data-test="token-chip"]'))
    .toContainText("--color-accent");
  await expect(page.locator('[data-test="token-field"][data-property="stroke"] [data-test="token-chip"]'))
    .toContainText("--color-accent");
});

test("dev: color value edits round-trip through the managed stylesheet", async ({ page }) => {
  await page.goto("/color-conformance");

  const hex = page.locator('[data-test="color-case-color-hex-six-digit"]');
  await hex.click();
  await waitForEditors(page);
  await setInput(page, "color", "#ef4444");

  await expect.poll(async () => hex.evaluate((element) => getComputedStyle(element).color))
    .toBe("rgb(239, 68, 68)");
  await expect.poll(async () => page.evaluate(() => document.getElementById("design-tool-styles")?.textContent ?? ""))
    .toContain("color: #ef4444;");
  await expect(hex).not.toHaveAttribute("style", /.*/);
});

test("dev: token alias chain resolves correctly", async ({ page }) => {
  await page.goto("/color-conformance");
  await page.locator('[data-test="color-case-color-token-alias-chain"]').click();
  await waitForEditors(page);

  const fg = page.locator('[data-test="token-field"][data-property="color"]');
  await expect(fg.locator('[data-test="token-chip"]')).toContainText("--color-error");
  await expect(fg.locator('[data-test="token-color-swatch"]')).toHaveAttribute("style", /--dt-swatch-color:\s*#dc2626/);
  await fg.locator('[data-test="token-chip"]').click();
  await expect(page.getByRole("option", { name: /--color-danger/ })).toBeVisible();
});

test("dev: inherited local color tokens remain attributable", async ({ page }) => {
  await page.goto("/color-conformance");
  await page.locator('[data-test="color-case-color-token-bg-only"]').click();
  await waitForEditors(page);

  const fg = page.locator('[data-test="token-field"][data-property="color"]');
  await expect(fg.locator('[data-test="token-chip"]')).toContainText("--color-ink");
  await expect(fg.locator('[data-test="token-color-swatch"]')).toHaveAttribute("style", /--dt-swatch-color:\s*#1a1a2e/);
});
