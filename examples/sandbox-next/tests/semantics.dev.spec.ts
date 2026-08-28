import { expect, test } from "@playwright/test";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

/**
 * Stage 5 — semantic component props on client components.
 *
 * Issue 0060: React 19-canary click delegation inside the shadow-root mount
 * does not dispatch onClick under Next 16 dev, so panel controls cannot be
 * driven through trusted pointer clicks here. The flip below therefore
 * invokes the control's own React handler (the same function a trusted click
 * would reach) — which still exercises the REAL rerender path: the wrapped
 * client component re-renders with the new prop value, no managed stylesheet
 * declaration is produced, and the durable session records callsite
 * identity.
 */

// Both flip specs were skipped pending issue 0060 (React 19-canary click
// delegation inside the shadow-root mount under Next 16 dev). The symptom
// does not reproduce on the pinned react ^19.2 line; these specs are the
// regression guard for panel clicks and prop controls.

async function selectBadge(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => Boolean(document.getElementById("nudge-ui-root"))))
    .toBe(true);
  // Bootstrap must have installed the runtime configuration before a
  // selection can resolve semantic targets.
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { __nudgeUi?: unknown }).__nudgeUi)))
    .toBe(true);
  // Wait until hydration has attached React fibers to the badge so the
  // selection resolves its semantic target in the same pass.
  await expect
    .poll(() => page.evaluate(() => {
      const badge = document.querySelector('[data-testid="client-badge"]');
      return Boolean(badge && Object.keys(badge).some((k) => k.startsWith("__reactFiber$")));
    }))
    .toBe(true);
  await page.locator('[data-testid="client-badge"]').evaluate((el) => {
    if (el instanceof HTMLElement) el.click();
  });
  await expect(page.locator('[data-test="selection"]')).toHaveAttribute(
    "data-selected-cid",
    "ClientBadge",
  );
}

test("dev: flipping a typed enum prop re-renders the real client component", async ({
  page,
}) => {
  await selectBadge(page);

  const section = page.locator('[data-test="component-props-section"]');
  await expect(section).toHaveAttribute("data-component", "ClientBadge");

  const before = await page
    .locator('[data-testid="client-badge"]')
    .evaluate((el) => el.className);
  expect(before).toContain("badge-accent");

  // Drive the tone select like a user: open the popup, pick the option.
  const trigger = page.locator('[data-test="component-prop-tone"]');
  await trigger.waitFor({ state: "visible", timeout: 15_000 });
  await trigger.click();
  const option = page.locator('.select__item[data-value="quiet"]');
  await option.waitFor({ state: "visible", timeout: 10_000 });
  await option.click();

  // A TRUE rerender: the real component's output changes.
  await expect
    .poll(() => page.locator('[data-testid="client-badge"]').evaluate((el) => el.className))
    .toContain("badge-quiet");
  // No managed stylesheet declaration may back a semantic override.
  const sheet = await page.evaluate(() => {
    const sheetEl = document.getElementById("nudge-ui-styles") as HTMLStyleElement | null;
    return sheetEl?.sheet ? Array.from(sheetEl.sheet.cssRules, (r) => r.cssText).join("\n") : "";
  });
  expect(sheet).not.toContain("ClientBadge");
});

test("dev: boolean prop flips through its segmented control handler", async ({ page }) => {
  await selectBadge(page);

  const control = page.locator('[data-test="component-prop-boolean"][data-property="disabled"]');
  await control.waitFor({ state: "visible", timeout: 15_000 });
  await control.getByText("On", { exact: true }).click();

  await expect
    .poll(() => page.locator('[data-testid="client-badge"]').evaluate((el) => el.className))
    .toContain("badge-disabled");
});

test("dev: server-component invocations never produce prop controls", async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => Boolean(document.getElementById("nudge-ui-root"))))
    .toBe(true);

  // HeroCard is a server component; its rendered elements carry identity but
  // must not expose semantic prop controls.
  await page.locator(".hero-card h2").evaluate((el) => {
    if (el instanceof HTMLElement) el.click();
  });
  await expect(page.locator('[data-test="selection"]')).toHaveAttribute(
    "data-selected-cid",
    "HeroCard",
  );
  await expect(page.locator('[data-test="component-props-section"]')).toHaveCount(0);
});
