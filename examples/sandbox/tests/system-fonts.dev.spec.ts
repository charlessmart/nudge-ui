import { expect, test, type Page } from "@playwright/test";
import { appLocator, openEditor } from "@nudge-ui/compatibility/playwright";
import { managedSheetText } from "./managedSheet.ts";

const FAMILIES = ["Helvetica Neue", "Georgia", "Avenir Next", ".SF NS"];

/** Headless Chromium dismisses the real prompt, so the editor gets a fixed list that still requires a gesture to ask. */
async function stubLocalFonts(page: Page, permission: "prompt" | "granted"): Promise<void> {
  await page.addInitScript(({ families, initial }) => {
    if (window !== window.top) return;
    let state = initial;
    Object.assign(window, {
      queryLocalFonts: async () => {
        if (state !== "granted" && !navigator.userActivation.isActive) {
          throw new DOMException("A user gesture is required.", "SecurityError");
        }
        state = "granted";
        return families.map((family) => ({ family }));
      },
    });
    const query = navigator.permissions.query.bind(navigator.permissions);
    navigator.permissions.query = (descriptor) => (descriptor.name === ("local-fonts" as PermissionName)
      ? Promise.resolve({ state } as PermissionStatus)
      : query(descriptor));
  }, { families: FAMILIES, initial: permission });
}

const familyLabels = (page: Page) => page.locator('[data-test="system-font-item"] .popover-listbox__label');

test("dev: the font family list asks for system fonts, then filters and applies them", async ({ page }) => {
  await stubLocalFonts(page, "prompt");
  await openEditor(page, "/typography-conformance");
  await appLocator(page, '[data-test="typography-case-type-direct-literals"]').click();

  const input = page.locator('[data-test="token-field"][data-property="font-family"] [data-test="raw-input"]');
  await input.click();
  const request = page.locator('[data-test="system-fonts-request"]');
  await expect(request).toHaveText("Show system fonts");
  await request.click();

  await expect(familyLabels(page)).toHaveText(["Avenir Next", "Georgia", "Helvetica Neue"]);
  await expect(page.locator(".popover-listbox__group-label")).toHaveText("System fonts");
  await expect(input).toHaveValue('"Aster Display"');

  await input.fill("neue");
  await expect(familyLabels(page)).toHaveText(["Helvetica Neue"]);
  await page.locator('[data-test="system-font-item"]').click();

  await expect.poll(() => managedSheetText(page)).toContain('font-family: "Helvetica Neue"');
});

test("dev: a token-backed font family offers system fonts beside its tokens", async ({ page }) => {
  await stubLocalFonts(page, "granted");
  await openEditor(page, "/typography-conformance");
  await appLocator(page, '[data-test="typography-case-type-var-fallback-family"]').click();

  const family = page.locator('[data-test="token-field"][data-property="font-family"]');
  await family.locator('[data-test="token-chip"]').click();
  await expect(familyLabels(page)).toHaveText(["Avenir Next", "Georgia", "Helvetica Neue"]);
  await expect(page.locator('[data-test="system-fonts-request"]')).toHaveCount(0);

  await page.locator('[data-test="token-chip-search"]').fill("geo");
  await page.locator('[data-test="system-font-item"]').click();

  await expect.poll(() => managedSheetText(page)).toContain("font-family: Georgia");
  await expect(family.locator('[data-test="raw-input"]')).toHaveValue("Georgia");
});

test("dev: hovering a system font previews it on the selection until the list closes", async ({ page }) => {
  await stubLocalFonts(page, "granted");
  await openEditor(page, "/typography-conformance");
  await appLocator(page, '[data-test="typography-case-type-direct-literals"]').click();
  const target = appLocator(page, ".typography-target-type-direct-literals");
  const authored = await target.evaluate((element) => getComputedStyle(element).fontFamily);
  const input = page.locator('[data-test="token-field"][data-property="font-family"] [data-test="raw-input"]');
  const family = (name: string) => page.locator('[data-test="system-font-item"]', { hasText: name });

  await input.click();
  await family("Helvetica Neue").hover();
  await expect(target).toHaveCSS("font-family", '"Helvetica Neue"');
  await family("Avenir Next").hover();
  await expect(target).toHaveCSS("font-family", '"Avenir Next"');
  await expect(input).toHaveValue('"Aster Display"');
  expect(await managedSheetText(page)).not.toContain("Avenir");

  await input.press("Escape");
  await expect(target).toHaveCSS("font-family", authored);

  await input.click();
  await family("Helvetica Neue").hover();
  await family("Helvetica Neue").click();
  await expect.poll(() => managedSheetText(page)).toContain('font-family: "Helvetica Neue"');
  await expect(target).toHaveCSS("font-family", '"Helvetica Neue"');
  await expect(target).not.toHaveAttribute("data-nudge-ui-value-preview");
});
