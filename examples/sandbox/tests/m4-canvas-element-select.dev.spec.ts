import { test, expect } from "@playwright/test";
import { getAppFrame } from "@nudge-ui/compatibility/playwright";

/**
 * Cross-iframe element selection. These tests exercise the path where the
 * user clicks a tracked element (`[data-cid]`) inside a canvas-card iframe
 * and the inspector should populate with the right component. Behaviours
 * under test:
 *
 * 1. Clicking a plain tracked element (heading, button, paragraph) inside a
 *    single-card canvas selects it in the inspector without triggering its
 *    application action or unmounting the workspace.
 * 2. Clicking a same-origin anchor (`<a href="/conformance">`) keeps the
 *    editing surface and lets the application handle its own navigation.
 * 3. Clicking a tracked element inside a sibling card whose URL differs from
 *    the parent's route must NOT navigate the parent page away from canvas
 *    mode (regression: `selectCard` used to call `window.location.href = ...`
 *    whenever the card URL didn't match the host's URL).
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
});

async function waitForIframeReady(page: import("@playwright/test").Page, index = 0): Promise<void> {
  await expect(page.locator(".canvas-card__iframe").nth(index)).toBeAttached();
  const frame = page.frameLocator(".canvas-card__iframe").nth(index);
  await expect(frame.locator("body")).toBeVisible({ timeout: 20000 });
}

async function setInspectorInput(
  page: import("@playwright/test").Page,
  property: string,
  value: string,
): Promise<void> {
  await page.evaluate(({ property, value }) => {
    const shadow = document.getElementById("nudge-ui-root")?.shadowRoot;
    const input = shadow?.querySelector(
      `[data-test="token-field"][data-property="${property}"] [data-test="raw-input"]`,
    ) as HTMLInputElement | null;
    if (!input) throw new Error(`Missing inspector input for ${property}`);
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    if (!setter) throw new Error("Missing native input value setter");
    input.focus();
    setter.call(input, value);
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.blur();
  }, { property, value });
}

test("dev: clicking a tracked non-anchor element inside an iframe selects it in the inspector", async ({ page }) => {
  await waitForIframeReady(page, 0);

  const frame = page.frameLocator(".canvas-card__iframe").first();
  const heading = frame.locator("#hero-title");
  await expect(heading).toBeVisible();

  await heading.click();

  await expect(page.locator('[data-test="canvas-selected-outline"]')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await expect.poll(async () => (await getAppFrame(page)).url()).toMatch(/\/playground$/);
});

test("dev: canvas mirrors inspector hover margins and selected outline over the iframe", async ({ page }) => {
  await waitForIframeReady(page, 0);

  const frame = page.frameLocator(".canvas-card__iframe").first();
  const heading = frame.locator("#hero-title");
  await heading.hover();

  await expect(page.locator('[data-test="canvas-hover-outline"]')).toBeVisible();
  await expect(page.locator(".canvas-hover-margin-fill")).toHaveCount(2);
  await expect(page.locator('.canvas-hover-margin[data-side="top"]')).toHaveAttribute("data-distance", /\d/);

  await heading.click();
  await expect(page.locator('[data-test="canvas-selected-outline"]')).toBeVisible();
});

test("dev: clicking a Button component selects it without triggering its application action", async ({ page }) => {
  await waitForIframeReady(page, 0);

  const frame = page.frameLocator(".canvas-card__iframe").first();
  const button = frame.locator('button.btn').first();
  await expect(button).toBeVisible();
  const buttonCid = await button.getAttribute("data-cid");
  expect(buttonCid).toBe("Button");

  await button.click();

  await expect(page.locator('[data-test="canvas-selected-outline"]')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();
  await expect(page.locator('[data-test="token-field"][data-property="color"] [data-test="token-chip"]'))
    .toContainText("--color-text-primary");
  await expect(frame.locator('[data-test="click-counter"]')).toContainText("clicks: 0");
});

test("dev: ordinary canvas clicks select without triggering and Command-click chooses its child", async ({ page }) => {
  await waitForIframeReady(page, 0);

  const frame = page.frameLocator(".canvas-card__iframe").first();
  const button = frame.locator("button.btn").first();
  const label = button.locator(".btn__label");
  const buttonSrc = await button.getAttribute("data-src");
  const labelSrc = await label.getAttribute("data-src");
  if (!buttonSrc || !labelSrc) throw new Error("Expected source identities for the selection fixture");
  expect(labelSrc).not.toBe(buttonSrc);

  await label.click();
  await expect(page.locator('[data-test="canvas-selected-outline"]')).toHaveAttribute("data-selected-src", buttonSrc);
  await expect(frame.locator('[data-test="click-counter"]')).toContainText("clicks: 0");

  await label.click({ modifiers: ["Meta"] });
  await expect(page.locator('[data-test="canvas-selected-outline"]')).toHaveAttribute("data-selected-src", labelSrc);
  await expect(frame.locator('[data-test="click-counter"]')).toContainText("clicks: 0");
});

test("dev: Command+Shift-click triggers the canvas application action", async ({ page }) => {
  await waitForIframeReady(page, 0);

  const frame = page.frameLocator(".canvas-card__iframe").first();
  const button = frame.locator("button.btn").first();
  await button.click({ modifiers: ["Meta", "Shift"] });
  await expect(frame.locator('[data-test="click-counter"]')).toContainText("clicks: 1");
});

test("dev: editing a selected canvas element updates that element inside the iframe", async ({ page }) => {
  await waitForIframeReady(page, 0);

  const frame = page.frameLocator(".canvas-card__iframe").first();
  const button = frame.locator("button.btn").first();
  await button.click();
  await expect(page.locator('[data-test="canvas-selected-outline"]')).toBeVisible();

  const padding = page.locator('[data-test="spacing-padding"]');
  await padding.locator('[data-test="individual-sides"]').click();
  await expect(padding).toHaveAttribute("data-expanded", "true");
  await setInspectorInput(page, "padding-top", "31px");

  await expect.poll(
    () => button.evaluate((element) => getComputedStyle(element).paddingTop),
    { timeout: 5000 },
  ).toBe("31px");
});

test("dev: reloading the selected card clears its stale element selection", async ({ page }) => {
  await waitForIframeReady(page, 0);

  const frame = page.frameLocator(".canvas-card__iframe").first();
  await frame.locator("button.btn").first().click();
  await expect(page.locator('[data-test="canvas-selected-outline"]')).toBeVisible();

  await page.locator('[data-test^="canvas-card-reload-"]').first().click();

  await expect(page.locator('[data-test="canvas-selected-outline"]')).not.toBeAttached();
  await waitForIframeReady(page, 0);
});

test("dev: clicking a navigable same-origin anchor navigates the same editing surface", async ({ page }) => {
  await waitForIframeReady(page, 0);
  const board = page.locator('[data-test="canvas-board"]');
  await expect(board.locator(".canvas-card")).toHaveCount(1);

  // The conformance anchor carries `data-cid="App"`; its click must reach the
  // navigation listener instead of being swallowed by element selection.
  await page.frameLocator(".canvas-card__iframe").first()
    .locator('a[href="/conformance"]')
    .click();

  await expect(board.locator(".canvas-card")).toHaveCount(1);
  await expect.poll(async () => (await getAppFrame(page)).url()).toMatch(/\/conformance$/);
});

test("dev: Command-click selects a canvas link without opening a route card", async ({ page }) => {
  await waitForIframeReady(page, 0);
  const board = page.locator('[data-test="canvas-board"]');
  const link = page.frameLocator(".canvas-card__iframe").first()
    .locator('a[href="/conformance"]')
    .first();

  await link.click({ modifiers: ["Meta"] });

  await expect(board.locator(".canvas-card")).toHaveCount(1);
  await expect(page.locator('[data-test="selection"]')).toBeVisible();
});

test("dev: clicking a tracked element inside a sibling card whose URL differs from the parent does not navigate the parent away from canvas", async ({ page }) => {
  await waitForIframeReady(page, 0);
  const parentUrlBefore = page.url();

  // Create an explicit comparison, then navigate that card. Selecting in the
  // comparison must not navigate the editor shell.
  await page.locator('[data-test^="canvas-card-duplicate-"]').first().click();
  await expect(page.locator(".canvas-card")).toHaveCount(2);
  await waitForIframeReady(page, 1);
  await page.frameLocator(".canvas-card__iframe").nth(1)
    .locator('a[href="/conformance"]')
    .click();

  await expect(page.locator(".canvas-card")).toHaveCount(2);
  await expect.poll(() => page.frames().filter((frame) => frame.url().endsWith("/conformance")).length).toBe(1);

  const secondFrame = page.frameLocator(".canvas-card__iframe").nth(1);
  const heading = secondFrame.locator("h1, h2, [data-cid]").first();
  await expect(heading).toBeVisible({ timeout: 20000 });

  await heading.click();
  await page.waitForTimeout(400);

  // Regression check: parent must remain in canvas mode on the original URL.
  expect(page.url()).toBe(parentUrlBefore);
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  // The canvas outline is the selection contract for a plain single element;
  // the Inspector badge is rendered only for groups, states, or edit scopes.
  await expect(page.locator('[data-test="canvas-selected-outline"]')).toBeVisible({ timeout: 5000 });
});
