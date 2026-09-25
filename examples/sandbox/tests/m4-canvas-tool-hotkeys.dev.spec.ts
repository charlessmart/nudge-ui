import { test, expect } from "@playwright/test";

test("dev: canvas tool hotkeys still work after selecting an iframe element", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  const frame = page.frameLocator(".canvas-card__iframe").first();
  const heading = frame.locator("#hero-title");
  await expect(heading).toBeVisible();
  await heading.click();
  await expect(page.locator('[data-test="canvas-selected-outline"]')).toBeVisible();

  await page.keyboard.press("h");

  await expect(page.locator('[data-test="canvas-tool-pan"]')).toHaveAttribute("data-active", "true");
});

test("dev: canvas tool hotkeys still work after selecting an iframe button", async ({ page }) => {
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  const frame = page.frameLocator(".canvas-card__iframe").first();
  const button = frame.locator("button.btn").first();
  await expect(button).toBeVisible();
  await button.click({ force: true });
  await expect(page.locator('[data-test="canvas-selected-outline"]')).toBeVisible();

  await page.keyboard.press("h");

  await expect(page.locator('[data-test="canvas-tool-pan"]')).toHaveAttribute("data-active", "true");
});

test("dev: canvas tool hotkeys survive an iframe window capture handler", async ({ page }) => {
  await page.addInitScript(() => {
    window.addEventListener("keydown", (event) => {
      if (event.code === "KeyH") event.stopPropagation();
    }, true);
  });
  await page.goto("/playground");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  const frame = page.frameLocator(".canvas-card__iframe").first();
  const heading = frame.locator("#hero-title");
  await expect(heading).toBeVisible();
  await heading.click();
  await expect(page.locator('[data-test="canvas-selected-outline"]')).toBeVisible();

  await page.keyboard.press("h");

  await expect(page.locator('[data-test="canvas-tool-pan"]')).toHaveAttribute("data-active", "true");
});
