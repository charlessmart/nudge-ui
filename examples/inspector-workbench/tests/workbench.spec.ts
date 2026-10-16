import { expect, test } from "@playwright/test";

test("renders real editors and resets local fixture state", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?nudge-ui=off&scenario=linked");
  const fixture = page.locator(".workbench-preview");
  await expect(fixture.locator('[data-test="typography"]')).toBeVisible();
  await expect(fixture.locator('[data-test="edit-scope"]')).toContainText("Affects 3 elements");
  await fixture.getByRole("button", { name: "Unlink", exact: true }).click();
  await expect(fixture.locator('[data-test="edit-scope"]')).toContainText("Element unlinked");
  await page.getByRole("button", { name: "Reset fixture" }).click();
  await expect(fixture.locator('[data-test="edit-scope"]')).toContainText("Affects 3 elements");
  expect(errors).toEqual([]);
});

test("keeps controlled token menus inside the fixture and resets their values", async ({ page }) => {
  await page.goto("/?nudge-ui=off&scenario=controls");
  const fixture = page.locator(".workbench-preview");
  await fixture.getByRole("combobox", { name: "Change border-radius token" }).click();
  const token = fixture.locator('[data-test="suggestion-item"]').filter({ hasText: "--fixture-radius-large" });
  await expect(token).toBeVisible();
  await token.click();
  await expect(fixture.locator('[data-property="border-radius"] [data-test="token-chip"]')).toContainText("--fixture-radius-large");
  await page.getByRole("button", { name: "Reset fixture" }).click();
  await expect(fixture.locator('[data-property="border-radius"] [data-test="token-chip"]')).toContainText("--fixture-radius");
  await expect(fixture.locator('[data-property="border-radius"] [data-test="token-chip"]')).not.toContainText("--fixture-radius-large");
});

test("inspects the real panel source and exports the edit using Nudge", async ({ page, context }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/?nudge-ui=on&scenario=typography");
  const fixture = page.frameLocator("iframe").locator(".workbench-preview");
  const title = fixture.locator('[data-test="appearance-section"] .editor__title');
  await expect(title).toBeVisible();
  await expect(title).toHaveAttribute("data-src", /packages\/nudge-ui\/src\/inspector\/styleEditors\/AppearanceSection\.tsx:/);
  await title.click();
  const inspector = page.locator("#nudge-ui-root");
  const opacity = inspector.locator('[data-test="opacity-input"]');
  await expect(opacity).toBeVisible();
  await opacity.fill("70%");
  await opacity.press("Enter");
  await expect(title).toHaveCSS("opacity", "0.7");
  // Editing the title must not change the fixture's selected content or create fixture edits.
  await expect(fixture.locator('[data-test="copy-prompt"]')).toBeDisabled();
  await inspector.locator('[data-test="copy-prompt"]').click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("AppearanceSection.tsx");
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("opacity");
  await inspector.getByRole("button", { name: "Use app normally" }).click();
  await page.frameLocator("iframe").getByRole("button", { name: "Reset fixture" }).click();
  await expect(title).toHaveCSS("opacity", "0.7");
  await expect(fixture.locator('[data-test="copy-prompt"]')).toBeDisabled();
  await page.screenshot({ path: "test-results/workbench-nudge.png", fullPage: true });
  expect(errors).toEqual([]);
});

test("seeds and clears fixture changes without persistence", async ({ page }) => {
  await page.goto("/?nudge-ui=off&scenario=changes");
  const fixture = page.locator(".workbench-preview");
  await expect(fixture.locator('[data-test="copy-prompt-change-count"]')).toHaveText("2");
  await fixture.locator('[data-test="changes-toggle"]').click();
  await expect(fixture.locator('[data-test="change-row"]')).toHaveCount(2);
  await page.getByRole("button", { name: "Typography", exact: true }).click();
  await expect(fixture.locator('[data-test="copy-prompt"]')).toBeDisabled();
  await expect(fixture.locator('[data-test="typography"]')).toBeVisible();
});
