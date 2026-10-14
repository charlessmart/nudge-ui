import { expect, test } from "@playwright/test";
import { openEditor } from "@nudge-ui/compatibility/playwright";

// ThinkingOrb comes from an npm package with no component protocol, so the
// compiler leaves it unwrapped. It must still be named from its identity tag
// and previewed live through React's DevTools toolkit (ADR-0034).
test("previews an unwrapped package component's props live and restores the authored value", async ({ page }) => {
  const app = await openEditor(page, "/playground");
  const orb = app.locator(".agent-activity-preview__chip canvas");
  await expect(orb).toHaveAttribute("aria-label", "Solving…");

  await orb.click();
  const section = page.locator('[data-test="component-props-section"]');
  await expect(section).toHaveAttribute("data-component", "ThinkingOrb");
  await expect(page.locator('[data-test="component-props-prompt-only"]')).toHaveCount(0);

  const chooseState = async (value: string) => {
    await page.locator('[data-test="component-prop-state"]').click();
    await page.locator(`.select__item[data-value="${value}"]`).click();
  };

  await chooseState("listening");
  await expect(orb).toHaveAttribute("aria-label", "Listening…");
  // A second edit of the same prop must not become the value restored later.
  await chooseState("searching");
  await expect(orb).toHaveAttribute("aria-label", "Searching…");

  const changes = page.locator('[data-test="changes-log"]');
  await changes.locator('[data-test="changes-toggle"]').click();
  const stateChange = changes.locator('[data-test="change-row"][data-property="state"]');
  while (await stateChange.count() > 0) {
    await stateChange.first().locator('[data-test="change-revert"]').click();
  }
  await expect(orb).toHaveAttribute("aria-label", "Solving…");
});
