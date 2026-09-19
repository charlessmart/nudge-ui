import { expect, test, type Frame, type Page } from "@playwright/test";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

/**
 * Stage 5 — semantic component props on client components.
 *
 * These tests use trusted browser interactions. Selection and prop changes
 * cross the same event bridge as an end user, then exercise the real rerender
 * path: the wrapped client component updates, no managed stylesheet
 * declaration is produced, and the durable session records callsite identity.
 */

async function openPreview(page: Page): Promise<Frame> {
  await page.goto("/");
  await expect(page).toHaveURL(/[?&]nudge-ui=editor(?:&|#|$)/);
  await expect(page.locator('[data-test^="canvas-card-iframe-"]')).toHaveCount(1);
  await expect.poll(() => page.frames().find((frame) => frame !== page.mainFrame()
    && frame.url().startsWith("http")
    && !frame.url().includes("/__nudge_ui__/editor"))?.url() ?? "").toMatch(/\/$/);
  const frame = page.frames().find((candidate) => candidate !== page.mainFrame()
    && candidate.url().startsWith("http")
    && !candidate.url().includes("/__nudge_ui__/editor"));
  if (!frame) throw new Error("Next preview frame did not become ready");
  return frame;
}

async function selectBadge(page: Page): Promise<Frame> {
  const frame = await openPreview(page);
  // Wait until hydration has attached React fibers to the badge so the
  // selection resolves its semantic target in the same pass.
  await expect
    .poll(() => frame.evaluate(() => {
      const badge = document.querySelector('[data-testid="client-badge"]');
      return Boolean(badge && Object.keys(badge).some((k) => k.startsWith("__reactFiber$")));
    }))
    .toBe(true);
  await frame.locator('[data-testid="client-badge"]').click();
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();
  return frame;
}

test("dev: flipping a typed enum prop re-renders the real client component", async ({
  page,
}) => {
  const frame = await selectBadge(page);

  const section = page.locator('[data-test="component-props-section"]');
  await expect(section).toHaveAttribute("data-component", "ClientBadge");

  const before = await frame
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
    .poll(() => frame.locator('[data-testid="client-badge"]').evaluate((el) => el.className))
    .toContain("badge-quiet");
  // No managed stylesheet declaration may back a semantic override.
  const sheet = await frame.evaluate(() => {
    const sheetEl = document.getElementById("nudge-ui-styles") as HTMLStyleElement | null;
    return sheetEl?.sheet ? Array.from(sheetEl.sheet.cssRules, (r) => r.cssText).join("\n") : "";
  });
  expect(sheet).not.toContain("ClientBadge");
});

test("dev: boolean prop flips through its segmented control handler", async ({ page }) => {
  const frame = await selectBadge(page);

  const control = page.locator('[data-test="component-prop-boolean"][data-property="disabled"]');
  await control.waitFor({ state: "visible", timeout: 15_000 });
  await control.getByText("On", { exact: true }).click();

  await expect
    .poll(() => frame.locator('[data-testid="client-badge"]').evaluate((el) => el.className))
    .toContain("badge-disabled");
});

test("dev: server-component invocations never produce prop controls", async ({ page }) => {
  const frame = await openPreview(page);

  // HeroCard is a server component; its rendered elements carry identity but
  // must not expose semantic prop controls.
  await frame.locator(".hero-card h2").click();
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();
  await expect(page.locator('[data-test="component-props-section"]')).toHaveCount(0);
});
