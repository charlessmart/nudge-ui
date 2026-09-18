import { expect, test } from "@playwright/test";
import { appLocator } from "./editor.ts";

test("dev: landing page renders the Penpot 'Landing V6 — Mono' design", async ({ page }) => {
  await page.goto("/");

  // Nav
  await expect(appLocator(page, ".landing-brand")).toHaveText(/Nudge UI/);
  await expect(appLocator(page, ".landing-nav-links a")).toHaveText("GitHub");

  // Hero + install command
  await expect(appLocator(page, "#landing-hero-title")).toHaveText("Design where code lives.");
  const install = appLocator(page, ".landing-install");
  await expect(install).toBeVisible();

  // App-window mockup with inspector preview
  await expect(appLocator(page, ".lw-url")).toContainText("localhost:5173/sandbox");
  await expect(appLocator(page, ".lw-sizechip")).toHaveText("360 × 148");
  await expect(appLocator(page, ".lwi-prompt-btn")).toHaveText("Copy prompt for agent");

  // Features
  await expect(appLocator(page, ".landing-features h2")).toHaveText("Made for design engineers.");
  const features = appLocator(page, ".landing-feature");
  await expect(features).toHaveCount(3);
  await expect(features.first()).toContainText("Tweak designs directly in your codebase");

  // Footer
  await expect(appLocator(page, ".landing-footer-content span").first()).toHaveText("Nudge UI — dev-only by design");
});

test("dev: landing install command renders the design copy", async ({ page }) => {
  await page.goto("/");

  const install = appLocator(page, ".landing-install");
  await expect(install).toContainText("Let's install nudge-ui/vite in this project");
  await expect(install).toContainText("Copy");

  // The window mockup's inspector controls are static replicas.
  await expect(appLocator(page, ".lwi-prompt-btn")).toBeVisible();
});

test("dev: /playground keeps the fixture corpus for the inspector suite", async ({ page }) => {
  await page.goto("/playground");

  await expect(appLocator(page, '[data-test="repeated-items"] .repeated-item').first()).toBeVisible();
  await expect(appLocator(page, '[data-test="flex-container"]')).toBeVisible();
  await expect(appLocator(page, "#hero-title")).toBeVisible();
});
