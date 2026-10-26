import { expect, test } from "@playwright/test";

test("renders real editors and resets local fixture state", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?nudge-ui=off&scenario=linked");
  const fixture = page.locator(".workbench-preview");
  await expect(fixture.locator('[data-test="typography"]')).toBeVisible();
  await expect(fixture.locator('[data-test="edit-scope"]')).toContainText("Linked (3)");
  await fixture.getByRole("button", { name: "Unlink", exact: true }).click();
  await expect(fixture.locator('[data-test="edit-scope"]')).toContainText("Unlinked");
  await page.getByRole("button", { name: "Reset fixture" }).click();
  await expect(fixture.locator('[data-test="edit-scope"]')).toContainText("Linked (3)");
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

test("shows the real canvas toolbar and the sketch bar in every state on one page", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?nudge-ui=off&scenario=toolbar");
  const gallery = page.locator('[data-test="toolbar-gallery"]');
  await expect(gallery.locator('[data-test^="canvas-toolbar-"]')).toHaveCount(4);
  await expect(gallery.locator('[data-test^="sketch-bar-"]')).toHaveCount(11);

  // Each interaction tool is active in its own toolbar, and only the Pencil opens the sketch bar.
  for (const tool of ["design", "comment", "sketch", "select"]) {
    await expect(gallery.locator(`[data-test="canvas-toolbar-${tool}"] [data-test="canvas-tool-${tool}"]`)).toHaveAttribute("data-active", "true");
  }
  await expect(gallery.locator('[data-test="canvas-toolbar-design"] [data-test="sketch-tool-options"]')).toHaveCount(0);
  await expect(gallery.locator('[data-test="canvas-toolbar-sketch"] [data-test="sketch-tool-options"]')).toHaveCount(1);

  // Each sketch bar holds its own state.
  const bar = (id: string) => gallery.locator(`[data-test="sketch-bar-${id}"]`);
  for (const tool of ["eraser", "rectangle", "text"]) {
    await expect(bar(tool).locator(`[data-test="sketch-tool-${tool}"]`)).toHaveAttribute("data-active", "true");
  }
  await expect(bar("palette").locator('[data-test="sketch-color-palette"]')).toHaveCount(1);
  await expect(bar("palette").locator('[data-test="sketch-color-red"]')).toBeVisible();
  await expect(bar("saving").locator('[data-test="sketch-copy"]')).toBeDisabled();
  await expect(bar("empty").locator('[data-test="sketch-copy"]')).toBeEnabled();
  await expect(bar("one-saved").locator('[data-test="sketch-recent"]')).toHaveCount(1);
  await expect(bar("three-saved").locator('[data-test="sketch-recent"]')).toHaveCount(3);

  // The bars are live: choosing a tool changes only that bar.
  await bar("pen").locator('[data-test="sketch-tool-text"]').click();
  await expect(bar("pen").locator('[data-test="sketch-tool-text"]')).toHaveAttribute("data-active", "true");
  await expect(bar("eraser").locator('[data-test="sketch-tool-eraser"]')).toHaveAttribute("data-active", "true");

  // The expanded bar shows its saved sketches as large cards.
  await expect(bar("three-expanded").locator('[data-test="sketch-recent-card"]')).toHaveCount(3);
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
