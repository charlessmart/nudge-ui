import { expect, test } from "@playwright/test";

test("dev: a component sheet renders inside the root layout (ADR-0050)", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`/__nudge_ui__/components?component=${encodeURIComponent("app/ClientBadge#ClientBadge")}`);

  const sheet = page.locator("[data-nudge-ui-sheet-host] .nudge-sheet");
  await expect(sheet.locator(".nudge-sheet-title")).toHaveText("ClientBadge", { timeout: 45_000 });
  // tone × disabled: two rows, two state columns.
  await expect(sheet.locator(".nudge-sheet-cell")).toHaveCount(4);
  await expect(sheet.locator('[data-testid="client-badge"]')).toHaveCount(4);
  expect(errors).toEqual([]);
});

test("dev: the renderer capture runs before React DOM loads", async ({ page }) => {
  await page.goto("/?nudge-ui=off");
  await expect(page.locator("head > script[data-nudge-ui-head]")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => {
    const hook = (window as { __REACT_DEVTOOLS_GLOBAL_HOOK__?: { renderers?: Map<number, unknown> } }).__REACT_DEVTOOLS_GLOBAL_HOOK__;
    return hook?.renderers?.size ?? 0;
  })).toBeGreaterThan(0);
});
