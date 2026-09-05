import { expect, test } from "@playwright/test";

test("dev: landing page renders the Penpot 'Landing V6 — Mono' design", async ({ page }) => {
  await page.goto("/");

  // Nav
  await expect(page.locator(".landing-brand")).toHaveText(/Nudge UI/);
  await expect(page.locator(".landing-nav-links a")).toHaveText("GitHub");

  // Hero + install command
  await expect(page.locator("#landing-hero-title")).toHaveText("Design where code lives.");
  const install = page.locator(".landing-install");
  await expect(install).toBeVisible();

  // App-window mockup with inspector preview
  await expect(page.locator(".lw-url")).toContainText("localhost:5173/sandbox");
  await expect(page.locator(".lw-sizechip")).toHaveText("360 × 148");
  await expect(page.locator(".lwi-prompt-btn")).toHaveText("Copy prompt for agent");

  // Features
  await expect(page.locator(".landing-features h2")).toHaveText("Made for design engineers.");
  const features = page.locator(".landing-feature");
  await expect(features).toHaveCount(3);
  await expect(features.first()).toContainText("Tweak designs directly in your codebase");

  // Footer
  await expect(page.locator(".landing-footer-content span").first()).toHaveText("Nudge UI — dev-only by design");
});

test("dev: landing install command renders the design copy", async ({ page }) => {
  await page.goto("/");

  const install = page.locator(".landing-install");
  await expect(install).toContainText("Let's install @nudge-ui/vite-react in this project");
  await expect(install).toContainText("Copy");

  // The window mockup's inspector controls are static replicas.
  await expect(page.locator(".lwi-prompt-btn")).toBeVisible();
});

test("dev: /playground keeps the fixture corpus for the inspector suite", async ({ page }) => {
  await page.goto("/playground");

  await expect(page.locator('[data-test="repeated-items"] .repeated-item').first()).toBeVisible();
  await expect(page.locator('[data-test="flex-container"]')).toBeVisible();
  await expect(page.locator("#hero-title")).toBeVisible();
});
