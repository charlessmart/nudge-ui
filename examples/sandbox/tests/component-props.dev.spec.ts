import { expect, test } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

test("edits typed React component props through the real component invocation", async ({ page }) => {
  await page.goto("/component-props");

  const button = page.getByRole("button", { name: "Publish changes" });
  await expect(button).toHaveAttribute("data-rendered-variant", "primary");
  await expect(button).toHaveAttribute("data-rendered-size", "small");
  await expect(button).toBeEnabled();

  await button.click();
  const componentSection = page.locator('[data-test="component-props-section"]');
  await expect(componentSection).toHaveAttribute("data-component", "SemanticButton");
  await expect(componentSection.locator('.dt-component-props__source')).toHaveCount(0);
  const componentSelects = componentSection.locator('button[role="combobox"]');
  await expect(componentSelects).toHaveCount(2);
  for (const property of ["variant", "size"]) {
    await expect(page.locator(`[data-test="component-prop-${property}"]`)).not.toHaveClass(/dt-select--compact/);
  }

  await page.locator('[data-test="component-prop-variant"]').click();
  await page.locator('.dt-select__item[data-value="secondary"]').click();
  await expect(button).toHaveAttribute("data-rendered-variant", "secondary");
  await expect(button).toHaveClass(/semantic-button--secondary/);

  await page.locator('[data-test="component-prop-size"]').click();
  await page.locator('.dt-select__item[data-value="large"]').click();
  await expect(button).toHaveAttribute("data-rendered-size", "large");
  await expect(button).toHaveClass(/semantic-button--large/);

  await page.locator(
    '[data-test="component-prop-boolean"][data-property="disabled"] button[aria-label="On"]',
  ).click();
  await expect(button).toBeDisabled();

  const changes = page.locator('[data-test="changes-log"]');
  await changes.locator('[data-test="changes-toggle"]').click();
  await expect(changes.locator('[data-test="change-row"]')).toHaveCount(3);

  const managedCss = await managedSheetText(page);
  expect(managedCss).not.toContain("variant");
  expect(managedCss).not.toContain("component-callsite");

  await page.locator('[data-test="copy-prompt"]').click();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain("## Component prop changes");
  expect(prompt).toContain("SemanticButton invocation");
  expect(prompt).toContain("`variant`: `primary` → `secondary`");
  expect(prompt).toContain("`size`: `small` → `large`");
  expect(prompt).toContain("`disabled`: `false` → `true`");
  expect(prompt).toContain("src/ui/SemanticButton#SemanticButton");

  await changes
    .locator('[data-test="change-row"][data-property="variant"] [data-test="change-revert"]')
    .click();
  await expect(button).toHaveAttribute("data-rendered-variant", "primary");
  await expect(changes.locator('[data-test="change-row"]')).toHaveCount(2);
});
