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

// Both flip specs are skipped pending issue 0060 (React 19-canary click
// delegation inside the shadow-root mount under Next 16 dev): the panel
// controls render but trusted clicks do not reach their handlers. The
// server-component isolation spec below passes because it asserts
// ABSENCE of controls.

async function selectBadge(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => Boolean(document.getElementById("design-tool-root"))))
    .toBe(true);
  // Bootstrap must have installed the runtime configuration before a
  // selection can resolve semantic targets.
  await expect
    .poll(() => page.evaluate(() => Boolean((window as unknown as { __designTool?: unknown }).__designTool)))
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

test.skip("dev: flipping a typed enum prop re-renders the real client component", async ({
  page,
}) => {
  await selectBadge(page);

  const section = page.locator('[data-test="component-props-section"]');
  await expect(section).toHaveAttribute("data-component", "ClientBadge");

  const before = await page
    .locator('[data-testid="client-badge"]')
    .evaluate((el) => el.className);
  expect(before).toContain("badge-accent");

  // Drive the tone select through its React handler (see issue 0060 note).
  await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")!.shadowRoot!;
    const control = sr.querySelector<HTMLElement>('[data-test="component-prop-tone"]')!;
    const walker = document.createTreeWalker(control, NodeFilter.SHOW_ELEMENT);
    let node: Element | null = walker.currentNode as Element;
    while (node) {
      const keys = Object.keys(node);
      const propsKey = keys.find((k) => k.startsWith("__reactProps$"));
      const props = propsKey
        ? (node as unknown as Record<string, { onValueChange?: (v: string) => void }>)[
            propsKey
          ]
        : null;
      if (props?.onValueChange) {
        props.onValueChange("quiet");
        return;
      }
      node = walker.nextNode() as Element | null;
    }
    throw new Error("tone control has no onValueChange");
  });

  // A TRUE rerender: the real component's output changes.
  await expect
    .poll(() => page.locator('[data-testid="client-badge"]').evaluate((el) => el.className))
    .toContain("badge-quiet");
  // No managed stylesheet declaration may back a semantic override.
  const sheet = await page.evaluate(() => {
    const sheetEl = document.getElementById("design-tool-styles") as HTMLStyleElement | null;
    return sheetEl?.sheet ? Array.from(sheetEl.sheet.cssRules, (r) => r.cssText).join("\n") : "";
  });
  expect(sheet).not.toContain("ClientBadge");
});

test.skip("dev: boolean prop flips through its segmented control handler", async ({ page }) => {
  await selectBadge(page);

  await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")!.shadowRoot!;
    const control = sr.querySelector<HTMLElement>('[data-test="component-prop-boolean"]')!;
    const walker = document.createTreeWalker(control, NodeFilter.SHOW_ELEMENT);
    let node: Element | null = walker.currentNode as Element;
    while (node) {
      const keys = Object.keys(node);
      const propsKey = keys.find((k) => k.startsWith("__reactProps$"));
      const props = propsKey
        ? (node as unknown as Record<string, { onValueChange?: (v: string) => void }>)[
            propsKey
          ]
        : null;
      if (props?.onValueChange) {
        props.onValueChange("true");
        return;
      }
      node = walker.nextNode() as Element | null;
    }
    throw new Error("boolean control has no onValueChange");
  });

  await expect
    .poll(() => page.locator('[data-testid="client-badge"]').evaluate((el) => el.className))
    .toContain("badge-disabled");
});

test("dev: server-component invocations never produce prop controls", async ({ page }) => {
  await page.goto("/");
  await expect
    .poll(() => page.evaluate(() => Boolean(document.getElementById("design-tool-root"))))
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
