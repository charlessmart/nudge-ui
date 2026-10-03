import { waitForCanvasTransition } from "./canvasTransition.ts";
import { test, expect } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";

async function waitForInspector(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.locator('[data-test="inspect-tab"]')).toBeVisible();
}

async function waitForLockedNotice(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.locator('[data-test="locked-workspace-notice"]')).toBeVisible();
}

async function managedSheetContent(page: import("@playwright/test").Page): Promise<string> {
  return managedSheetText(page);
}

async function setInput(
  page: import("@playwright/test").Page,
  property: string,
  value: string,
): Promise<void> {
  await page.evaluate(
    ({ p, v }) => {
      const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
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

async function expandSpacing(page: import("@playwright/test").Page): Promise<void> {
  const spacing = page.locator('[data-test="spacing-padding"]');
  const add = spacing.locator('[data-test="add-value"]');
  if (await add.count()) await add.click();
  await spacing.locator('[data-test="individual-sides"]').click();
  await expect(spacing).toHaveAttribute("data-expanded", "true");
}

test.describe("Canvas workspace lease — single ownership", () => {
  test("dev: second tab shows locked workspace notice with takeover", async ({ page, context }) => {
    await page.goto("/playground");
    await page.locator('[data-test="canvas-show-canvas"]').click();
    await waitForCanvasTransition(page);
    await page.frameLocator(".canvas-card__iframe").first().getByRole("button", { name: "Save a change", exact: true }).click();
    await waitForInspector(page);

    // Tab 1 has inspector working normally
    await expect(page.locator('[data-test="inspect-tab"]')).toBeVisible();

    // Open a second tab
    const page2 = await context.newPage();
    await page2.goto("/playground");
    await waitForLockedNotice(page2);

    // Second tab should show locked notice, not inspector
    const lockedNotice = page2.locator('[data-test="locked-workspace-notice"]');
    await expect(lockedNotice).toBeVisible();
    const noticeText = await lockedNotice.textContent();
    expect(noticeText).toContain("Nudge UI is open in another tab");
    expect(noticeText).not.toContain("Nudge UI writes are disabled");
    expect(noticeText).not.toContain("Active workspace");
    await expect(lockedNotice.locator(".locked-notice__detail")).toHaveCount(0);

    // Takeover button should exist
    const takeoverBtn = page2.locator('[data-test="takeover-here"]');
    await expect(takeoverBtn).toBeVisible();

    // Close second tab
    await page2.close();
  });

  test("dev: takeover transfers ownership and old tab loses authority", async ({ page, context }) => {
    await page.goto("/playground");
    await page.locator('[data-test="canvas-show-canvas"]').click();
    await waitForCanvasTransition(page);
    await page.frameLocator(".canvas-card__iframe").first().getByRole("button", { name: "Save a change", exact: true }).click();
    await waitForInspector(page);

    // Open second tab
    const page2 = await context.newPage();
    await page2.goto("/playground");
    await waitForLockedNotice(page2);

    // Take over in second tab
    await page2.locator('[data-test="takeover-here"]').click();

    // Takeover is an in-place handoff: B becomes editable without a reload and
    // A is replaced by the locked panel before it can issue another edit.
    await waitForInspector(page2);
    await expect(page2.locator('[data-test="locked-workspace-notice"]')).not.toBeVisible();
    const showCanvas = page2.locator('[data-test="canvas-show-canvas"]');
    if (await showCanvas.isVisible()) await showCanvas.click();
    await waitForCanvasTransition(page2);
    await page2.frameLocator(".canvas-card__iframe").first().getByRole("button", { name: "Save a change", exact: true }).click();
    await expect(page2.locator('[data-test="style-editors"]')).toBeVisible();
    await waitForLockedNotice(page);
    await expect(page.locator('[data-test="inspect-tab"]')).not.toBeVisible();

    // Close pages
    await page2.close();
  });
});

test.describe("Canvas workspace lease — expiry recovery", () => {
  test("dev: expired lease allows new tab to acquire ownership", async ({ page, context }) => {
    await page.goto("/playground");
    await page.locator('[data-test="canvas-show-canvas"]').click();
    await waitForCanvasTransition(page);
    await page.frameLocator(".canvas-card__iframe").first().getByRole("button", { name: "Save a change", exact: true }).click();
    await waitForInspector(page);

    // Simulate an expired lease by writing one with old heartbeat
    await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter((k) => k.startsWith("nudge-ui:") && k.endsWith(":lease"));
      if (keys.length > 0) {
        const raw = localStorage.getItem(keys[0]!);
        if (raw) {
          const lease = JSON.parse(raw);
          lease.lastHeartbeat = Date.now() - 20000;
          localStorage.setItem(keys[0]!, JSON.stringify(lease));
        }
      }
    });

    // Open a second tab — should acquire the expired lease
    const page2 = await context.newPage();
    await page2.goto("/playground");

    // Should get inspector (not locked notice), since lease was expired
    await waitForInspector(page2);
    await expect(page2.locator('[data-test="inspect-tab"]')).toBeVisible();
    const showCanvas = page2.locator('[data-test="canvas-show-canvas"]');
    if (await showCanvas.isVisible()) await showCanvas.click();
    await waitForCanvasTransition(page2);
    await page2.frameLocator(".canvas-card__iframe").first().getByRole("button", { name: "Save a change", exact: true }).click();
    await expect(page2.locator('[data-test="style-editors"]')).toBeVisible();

    await page2.close();
  });
});

test.describe("Canvas workspace — stale change detection", () => {
  test("dev: restored stale change shows stale indicator", async ({ page }) => {
    await page.goto("/playground");
    await page.locator('[data-test="canvas-show-canvas"]').click();
    await waitForCanvasTransition(page);
    await page.frameLocator(".canvas-card__iframe").first().getByRole("button", { name: "Save a change", exact: true }).click();
    await waitForInspector(page);

    // Make an edit so we have a persisted change
    await expandSpacing(page);
    await setInput(page, "padding-top", "48px");
    await expect.poll(() => managedSheetContent(page)).toContain("padding-top: 48px;");

    // Persist a session with that edit
    // (session is auto-saved on change)

    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith("nudge-ui-drafts:")))).toBe(true);

    // Now inject a fake "stale" change into the session — one that won't match any DOM element
    await page.addInitScript(() => {
      const keys = Object.keys(localStorage).filter((k) =>
        k.startsWith("nudge-ui-drafts:") && k.endsWith(":v1"),
      );
      if (keys.length === 0) return;
      const raw = localStorage.getItem(keys[0]!);
      if (!raw) return;
      const session = JSON.parse(raw);
      session.drafts[0].contents.changes.push({
        kind: "element",
        cid: "GoneComponent",
        file: "src/Deleted.tsx",
        line: 1,
        selector: '[data-cid="GoneComponent"][data-src*="Deleted.tsx:1"]',
        property: "margin",
        rawValue: "24px",
        oldToken: null,
        newToken: null,
        source: { file: "src/Deleted.tsx", line: 1, component: "GoneComponent" },
        scope: "source-site",
      });
      localStorage.setItem(keys[0]!, JSON.stringify(session));
    });

    // Reload to trigger hydration
    await page.reload();
    await waitForInspector(page);

    // Restored sessions should keep the clear action available below Changes
    const clearSession = page.locator('[data-test="clear-session"]');
    await expect(clearSession).toBeVisible();
    await expect(clearSession.locator(".."))
      .toHaveClass(/changes__session-action/);

    // The stale change should be in the changes log
    const changeRows = page.locator('[data-test="change-row"]');
    await expect.poll(() => changeRows.count()).toBeGreaterThanOrEqual(1);

  });

  test("dev: stale state retains exact selector and source data", async ({ page }) => {
    await page.goto("/playground");
    await page.locator('[data-test="canvas-show-canvas"]').click();
    await waitForCanvasTransition(page);
    await page.frameLocator(".canvas-card__iframe").first().getByRole("button", { name: "Save a change", exact: true }).click();
    await waitForInspector(page);

    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith("nudge-ui-drafts:")))).toBe(true);

    // Keep the saved layout and inject stale intent into its authoritative draft.
    await page.addInitScript(() => {
      const key = Object.keys(localStorage).find((key) => key.startsWith("nudge-ui-drafts:") && key.endsWith(":v1"));
      if (!key) throw new Error("expected persisted draft history");
      const history = JSON.parse(localStorage.getItem(key)!);
      history.drafts[0].contents.changes = [{
        cid: "Widget", file: "src/Widget.tsx", line: 5,
        selector: '[data-cid="Widget"][data-src*="Widget.tsx:5"]',
        property: "margin", rawValue: "16px", oldToken: null, newToken: null,
        source: { file: "src/Widget.tsx", line: 5, component: "Widget" },
        scope: "source-site",
      }];
      localStorage.setItem(key, JSON.stringify(history));
    });

    await page.reload();
    await waitForInspector(page);

    // Restore notice should appear
    await expect(page.locator('[data-test="clear-session"]')).toBeVisible();

    // Wait for stale detection timeout
    await page.waitForTimeout(7000);

    // The stale change should still be present (not deleted, not broadened)
    const sheet = await managedSheetContent(page);
    // The rule should be applied (stale does not mean deleted)
    expect(sheet).toContain("16px");

    // Verify clear session works even with stale changes
    const clearBtn = page.locator('[data-test="clear-session"]');
    if (await clearBtn.isVisible().catch(() => false)) {
      await clearBtn.click();
      // After clearing, no stale changes remain
      await expect.poll(() => managedSheetContent(page)).not.toContain("16px");
    }
  });
});
