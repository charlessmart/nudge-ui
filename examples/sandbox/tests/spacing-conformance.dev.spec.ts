import { expect, test } from "@playwright/test";

test("dev: spacing conformance gallery renders every shared case and selects a sample", async ({ page }) => {
  await page.goto("/spacing-conformance");

  const cards = page.locator(".spacing-case-card");
  await expect(cards).toHaveCount(5);
  await expect(page.locator(".spacing-conformance-meta")).toContainText("5 shared cases");

  const firstTarget = page.locator('[data-test="spacing-case-spacing-physical-four-value"]');
  await expect(firstTarget).toBeVisible();
  await firstTarget.click();

  await expect.poll(async () => page.evaluate(() => {
    const root = document.getElementById("design-tool-root")?.shadowRoot;
    return root?.querySelector('[data-test="selection"]')?.textContent ?? "";
  })).toContain("SpacingConformance:spacing-physical-four-value");
});
