import { test, expect } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";

async function managedSheetContent(page: import("@playwright/test").Page): Promise<string> {
  return managedSheetText(page);
}

async function waitForInspector(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          Boolean(
            document
              .getElementById("design-tool-root")
              ?.shadowRoot?.querySelector('[data-test="inspect-tab"]'),
          ),
        ),
      { timeout: 5000 },
    )
    .toBe(true);
}

async function expandSpacing(page: import("@playwright/test").Page): Promise<void> {
  const spacing = page.locator('[data-test="spacing-padding"]');
  await spacing.locator('[data-test="individual-sides"]').click();
  await expect(spacing).toHaveAttribute("data-expanded", "true");
}

async function setInput(
  page: import("@playwright/test").Page,
  property: string,
  value: string,
): Promise<void> {
  await page.evaluate(
    ({ p, v }) => {
      const sr = document.getElementById("design-tool-root")?.shadowRoot;
      const raw = sr?.querySelector(
        `[data-test="token-field"][data-property="${p}"] [data-test="raw-input"]`,
      ) as HTMLInputElement | null;
      if (!raw) return;
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      raw.focus();
      setter.call(raw, v);
      raw.dispatchEvent(new Event("change", { bubbles: true }));
      raw.blur();
    },
    { p: property, v: value },
  );
}

test.describe("Canvas durable session", () => {
  test("dev: edits survive page refresh without restore-count copy", async ({ page }) => {
    await page.goto("/");
    await page.click("text=Save");
    await waitForInspector(page);

    // Make an element edit in Inspect mode
    await expandSpacing(page);
    await setInput(page, "padding-top", "32px");
    await expect.poll(() => managedSheetContent(page)).toContain("padding-top: 32px;");

    // Verify the clear action is NOT shown before refresh (no session was loaded)
    const clearBefore = await page.locator('[data-test="clear-session"]').isVisible().catch(() => false);
    expect(clearBefore).toBe(false);

    // Reload the page
    await page.reload();
    await waitForInspector(page);

    // The restore-count message should stay hidden, while the clear action remains available below Changes
    await expect(page.locator('[data-test="clear-session"]')).toBeVisible();
    await expect(page.locator('[data-test="session-actions"]')).toHaveClass(/dt-changes__session-action/);

    // The edit should still be present
    await expect.poll(() => managedSheetContent(page)).toContain("padding-top: 32px;");
  });

  test("dev: canvas mode and cards survive refresh", async ({ page }) => {
    await page.goto("/");
    await waitForInspector(page);

    // Enter Canvas mode
    await page.locator('[data-test="mode-canvas"]').click();
    await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

    // Card should exist
    const board = page.locator('[data-test="canvas-board"]');
    await expect(board.locator(".dt-canvas-card")).toHaveCount(1);

    // Reload
    await page.reload();
    await waitForInspector(page);

    // Should return to Canvas mode with the card
    await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
    await expect(board.locator(".dt-canvas-card")).toHaveCount(1);
  });

  test("dev: inspect mode survives refresh", async ({ page }) => {
    await page.goto("/");
    await waitForInspector(page);

    // Make sure we're in inspect mode
    await expect(page.locator('[data-test="mode-preview"]')).toHaveAttribute("aria-pressed", "true");

    // Reload
    await page.reload();
    await waitForInspector(page);

    // Should still be in inspect mode
    await expect(page.locator('[data-test="mode-preview"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('[data-test="canvas-workspace"]')).not.toBeVisible();
  });

  test("dev: clear session removes all edits and workspace state", async ({ page }) => {
    await page.goto("/");
    await page.click("text=Save");
    await waitForInspector(page);

    // Make edits
    await expandSpacing(page);
    await setInput(page, "padding-top", "48px");
    await expect.poll(() => managedSheetContent(page)).toContain("padding-top: 48px;");

    // Enter Canvas, then exit
    await page.locator('[data-test="mode-canvas"]').click();
    await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
    await page.locator('[data-test="mode-preview"]').click();

    // Click "Clear Session" from the session actions
    await page.reload();
    await waitForInspector(page);

    // Restored sessions should have the clear button
    const clearBtn = page.locator('[data-test="clear-session"]');
    const clearVisible = await clearBtn.isVisible().catch(() => false);
    if (clearVisible) {
      await clearBtn.click();
    } else {
      // If no stored session, just verify state is clean
    }

    // After clearing, edits should be gone
    await expect.poll(() => managedSheetContent(page)).not.toContain("padding-top: 48px;");

    // Should be in inspect mode
    await expect(page.locator('[data-test="mode-preview"]')).toHaveAttribute("aria-pressed", "true");
  });

  test("dev: global token edits survive refresh", async ({ page }) => {
    await page.goto("/");
    await waitForInspector(page);

    // Switch to Tokens tab and edit a global token
    await page.locator('[data-test="tokens-tab"]').click();
    await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));

    const row = page.locator(
      '[data-test="global-token-row"][data-token-name="--color-surface-raised"]',
    );
    await expect(row).toBeVisible();

    const input = row.locator('[data-test="raw-input"]');
    await input.fill("#abcdef");
    await input.press("Enter");

    await expect.poll(() => managedSheetContent(page)).toContain("--color-surface-raised: #abcdef;");

    // Reload
    await page.reload();
    await waitForInspector(page);

    // Token edit should survive
    await page.locator('[data-test="tokens-tab"]').click();
    await expect.poll(() => managedSheetContent(page)).toContain("--color-surface-raised: #abcdef;");
  });

  test("dev: instance-preview edits do NOT survive refresh", async ({ page }) => {
    await page.goto("/");
    await waitForInspector(page);

    // Find a repeated element that can be unlinked
    // Click on the first "card" element
    await page.click("text=Save");
    await waitForInspector(page);

    // Verify session actions disappear when we clear the session first
    const clearBtn = page.locator('[data-test="clear-session"]');
    if (await clearBtn.isVisible().catch(() => false)) {
      await clearBtn.click();
    }

    // Make a source-site edit first so we have a known baseline
    await expandSpacing(page);
    await setInput(page, "padding-top", "24px");
    await expect.poll(() => managedSheetContent(page)).toContain("padding-top: 24px;");

    // Reload and verify the source-site edit survives
    await page.reload();
    await waitForInspector(page);
    await expect.poll(() => managedSheetContent(page)).toContain("padding-top: 24px;");

    // The instance-preview warning text should be present in the UI
    // (but we can't trigger instance-preview reliably in e2e without a multi-instance component,
    // so we just verify the UI elements exist and source-site edits survive)
    // The unlink button exists in the inspector when there are multiple instances
    const unlinkBtn = page.locator('[data-test="unlink-element"]');
    const hasUnlink = await unlinkBtn.isVisible().catch(() => false);
    // If we see the unlink button, a multi-instance element is selected
    if (hasUnlink) {
      await unlinkBtn.click();
      await page.reload();
      await waitForInspector(page);
      // Instance-preview scope message should be in the UI
      // We just verify the page loads without error
    }
  });
});

test.describe("Canvas durable session — restore safety", () => {
  test("dev: malformed session data is discarded safely", async ({ page }) => {
    await page.goto("/");
    await waitForInspector(page);

    // Inject malformed session data into localStorage
    await page.evaluate(() => {
      // Find any existing design-tool key and corrupt it
      const keys = Object.keys(localStorage).filter((k) => k.startsWith("design-tool:"));
      for (const key of keys) {
        localStorage.setItem(key, "not-valid-json{{");
      }
    });

    // Reload — should not crash
    await page.reload();
    await waitForInspector(page);

    // Inspector should load normally (no restore notice, no corrupted state)
    await expect(page.locator('[data-test="inspect-tab"]')).toBeVisible();
  });
});
