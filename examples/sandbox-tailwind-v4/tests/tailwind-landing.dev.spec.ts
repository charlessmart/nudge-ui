import { expect, test } from "@playwright/test";
import { openEditor } from "@nudge-ui/compatibility/playwright";

async function waitForEditors(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(async () => page.evaluate(() => {
      const root = document.getElementById("nudge-ui-root")?.shadowRoot;
      return Boolean(root?.querySelector('[data-test="style-editors"]'));
    }), { timeout: 5000 })
    .toBe(true);
}

async function waitForInspector(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(async () => page.evaluate(() => Boolean(document.getElementById("nudge-ui-root")?.shadowRoot?.querySelector('[data-test="inspect-tab"]'))), { timeout: 5000 })
    .toBe(true);
}

test("dev: Tailwind landing page renders utility-styled content", async ({ page }) => {
  const app = await openEditor(page, "/tailwind");

  await expect(app.getByRole("heading", { name: /Less ceremony/i })).toBeVisible();
  await expect(app.getByRole("link", { name: /Start a workspace/i })).toBeVisible();

  const hero = app.locator("main");
  await expect(hero).toHaveClass(/bg-stone-950/);
  await expect(app.locator("[class*='bg-lime-300']").first()).toBeVisible();
});

test("dev: Tailwind post-transform theme tokens reach the virtual catalog", async ({ page }) => {
  const app = await openEditor(page, "/tailwind");

  await expect.poll(async () => app.locator("html").evaluate(() => {
    const catalog = (window as unknown as {
      __designTokenCatalog?: { cssName: string; declarations: { source: string; context?: { selector?: string } }[] }[];
    }).__designTokenCatalog ?? [];
    const token = catalog.find((entry) => entry.cssName === "--color-lime-300");
    return token ? {
      source: token.declarations[0]?.source,
      selector: token.declarations[0]?.context?.selector,
    } : null;
  })).toEqual({
    source: expect.stringContaining("src/tailwind.css:"),
    selector: ":root, :host",
  });
});

test("dev: Tailwind local aliases remain identifiable in the inspector", async ({ page }) => {
  const app = await openEditor(page, "/tailwind");
  await waitForInspector(page);
  await app.locator("#notes blockquote").evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });

  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("nudge-ui-root")?.shadowRoot;
    return (root?.querySelector(
      '[data-test="token-field"][data-property="line-height"] input[aria-hidden="true"]',
    ) as HTMLInputElement | null)?.value ?? null;
  })).toContain("--tw-leading");
});

test("dev: Tailwind inherited color resolves from an ancestor utility", async ({ page }) => {
  const app = await openEditor(page, "/tailwind");
  await waitForInspector(page);
  await app.locator("#tailwind-title").evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });

  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("nudge-ui-root")?.shadowRoot;
    return root?.querySelector('[data-test="token-field"][data-property="color"] [data-test="token-chip"]')?.textContent?.trim() ?? null;
  })).toBe("--color-stone-100");
});

test("dev: Tailwind v4 color opacity keeps base token, alpha, and painted preview separate", async ({ page }) => {
  const app = await openEditor(page, "/tailwind");
  await waitForInspector(page);
  const fixture = app.locator('[data-test="tailwind-alpha"]');
  await expect(fixture).toBeVisible();
  const facts = await fixture.evaluate((element) => ({
    authored: [...document.styleSheets].flatMap((sheet) => {
      try { return [...sheet.cssRules]; } catch { return []; }
    }).map((rule) => rule.cssText).find((text) => text.includes("bg-red-500")) ?? "",
    computed: getComputedStyle(element).backgroundColor,
    catalog: (window as unknown as { __designTokenCatalog?: { cssName: string; adapter?: string; origin?: string }[] }).__designTokenCatalog ?? [],
  }));
  expect(facts.authored).toContain("--color-red-500");
  expect(facts.authored).toContain("10%");
  expect(facts.catalog.find((entry) => entry.cssName === "--color-red-500")).toMatchObject({ adapter: "tailwind-v4" });

  await fixture.click({ position: { x: 5, y: 5 } });
  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("nudge-ui-root")?.shadowRoot;
    return root?.querySelector('[data-test="token-field"][data-property="background-color"] [data-test="token-chip"]')?.textContent?.trim() ?? null;
  })).toBe("--color-red-500");
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="raw-input"]'))
    .toHaveCount(0);
  await expect(page.locator('[data-test="token-field"][data-property="background-color"] [data-test="color-opacity-input"]'))
    .toHaveValue("10%");
});

test("dev: Tailwind side border utilities parse into independent inspector fields", async ({ page }) => {
  const app = await openEditor(page, "/tailwind");
  await waitForInspector(page);
  const fixture = app.locator('[data-test="tailwind-border-mixed"]');
  await fixture.evaluate((element) => {
    element.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));
  });
  await waitForEditors(page);
  await expect.poll(async () => fixture.evaluate((element) => {
    const style = getComputedStyle(element);
    return [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].join(",");
  })).toBe("2px,4px,8px,1px");

  await expect(page.locator('[data-test="style-editors"] .border')).toHaveAttribute("data-expanded", "true");
  await expect(page.locator('[data-test="token-field"][data-property="border-top-width"] [data-test="raw-input"]')).toHaveValue("2px");
  await expect(page.locator('[data-test="token-field"][data-property="border-right-width"] [data-test="raw-input"]')).toHaveValue("4px");
  await expect(page.locator('[data-test="border-style-top"]')).toHaveAttribute("aria-label", "Border style: Dashed");
  await expect(page.locator('[data-test="token-field"][data-property="border-top-color"] [data-test="token-chip"]')).toContainText("--color-lime-300");
});
