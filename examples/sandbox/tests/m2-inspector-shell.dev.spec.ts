import { test, expect } from "@playwright/test";
import { openEditor } from "@nudge-ui/compatibility/playwright";

test("dev: inspector shell mounts in Shadow DOM and toggles from the keyboard", async ({ page }) => {
  await openEditor(page, "/playground");

  await expect(page.locator('[data-test="copy-prompt"]')).toBeDisabled();

  const getOpen = () =>
    page.evaluate(
      () =>
        document
          .getElementById("nudge-ui-root")
          ?.shadowRoot?.querySelector(".panel")
          ?.getAttribute("data-open") ?? null,
    );

  const before = await getOpen();
  await page.keyboard.press("Control+\\");
  const afterToggle = await getOpen();
  expect(afterToggle).not.toBe(before);

  await page.keyboard.press("Control+\\");
  const afterSecond = await getOpen();
  expect(afterSecond).toBe(before);

  await page.locator('[data-test="settings-button"]').click();
  await page.getByRole("button", { name: "Tokens", exact: true }).click();
  await expect(page.locator('[data-test="settings-dialog"]')).toBeVisible();
  await expect(page.locator('[data-test="settings-section-tokens"]')).toBeVisible();
  await expect(page.locator('[data-test="tokens-panel"]')).toBeVisible();
});

test("dev: inspector controls respond while the iframe element selector is active", async ({ page }) => {
  // Regression guard: the element selector swallows ordinary application
  // clicks at the document capture phase, but real browser clicks are
  // composed and their propagation path includes the document even when they
  // originate inside the inspector's shadow root. The selector must let
  // inspector-UI clicks through so the panel's own controls keep working.
  await openEditor(page, "/playground");

  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await page.locator('[data-test="settings-button"]').click();
  await expect(page.locator('[data-test="settings-dialog"]')).toBeVisible();
});

test("dev: inspector can collapse and reopen from its icon controls on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEditor(page, "/playground");

  const panel = page.locator(".panel");
  await expect(panel).toHaveAttribute("data-open", "true");
  await page.locator('[data-test="collapse-inspector"]').click();
  await expect(panel).toHaveAttribute("data-open", "false");
  await expect(page.locator('[data-test="show-inspector"]')).toBeVisible();

  await page.locator('[data-test="show-inspector"]').click();
  await expect(panel).toHaveAttribute("data-open", "true");
});
