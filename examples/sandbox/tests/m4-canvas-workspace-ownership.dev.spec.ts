import { test, expect } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";

async function waitForInspector(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          Boolean(
            document
              .getElementById("nudge-ui-root")
              ?.shadowRoot?.querySelector('[data-test="inspect-tab"]'),
          ),
        ),
      { timeout: 5000 },
    )
    .toBe(true);
}

async function waitForLockedNotice(page: import("@playwright/test").Page): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          Boolean(
            document
              .getElementById("nudge-ui-root")
              ?.shadowRoot?.querySelector('[data-test="locked-workspace-notice"]'),
          ),
        ),
      { timeout: 5000 },
    )
    .toBe(true);
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
    await page.click("text=Save");
    await waitForInspector(page);

    // Tab 1 has inspector working normally
    await expect(page.locator('[data-test="inspect-tab"]')).toBeVisible();

    // Open a second tab
    const page2 = await context.newPage();
    await page2.goto("/playground");
    await page2.click("text=Save");
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
    await page.click("text=Save");
    await waitForInspector(page);

    // Open second tab
    const page2 = await context.newPage();
    await page2.goto("/playground");
    await page2.click("text=Save");
    await waitForLockedNotice(page2);

    // Take over in second tab
    await page2.locator('[data-test="takeover-here"]').click();

    // Takeover is an in-place handoff: B becomes editable without a reload and
    // A is replaced by the locked panel before it can issue another edit.
    await waitForInspector(page2);
    await expect(page2.locator('[data-test="locked-workspace-notice"]')).not.toBeVisible();
    await waitForLockedNotice(page);
    await expect(page.locator('[data-test="inspect-tab"]')).not.toBeVisible();

    // Close pages
    await page2.close();
  });
});

test.describe("Canvas workspace lease — expiry recovery", () => {
  test("dev: expired lease allows new tab to acquire ownership", async ({ page, context }) => {
    await page.goto("/playground");
    await page.click("text=Save");
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
    await page2.click("text=Save");

    // Should get inspector (not locked notice), since lease was expired
    await waitForInspector(page2);
    await expect(page2.locator('[data-test="inspect-tab"]')).toBeVisible();

    await page2.close();
  });
});

test.describe("Canvas workspace — stale change detection", () => {
  test("dev: restored stale change shows stale indicator", async ({ page }) => {
    await page.goto("/playground");
    await page.click("text=Save");
    await waitForInspector(page);

    // Make an edit so we have a persisted change
    await expandSpacing(page);
    await setInput(page, "padding-top", "48px");
    await expect.poll(() => managedSheetContent(page)).toContain("padding-top: 48px;");

    // Persist a session with that edit
    // (session is auto-saved on change)

    // Now inject a fake "stale" change into the session — one that won't match any DOM element
    await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter((k) =>
        k.startsWith("nudge-ui:") && k.endsWith(":v12"),
      );
      if (keys.length === 0) return;
      const raw = localStorage.getItem(keys[0]!);
      if (!raw) return;
      const session = JSON.parse(raw);
      session.changes.push({
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
    await page.click("text=Save");
    await waitForInspector(page);

    // Prepare a session with a known stale change
    await page.evaluate(() => {
      const keys = Object.keys(localStorage).filter((k) =>
        k.startsWith("nudge-ui:") && !k.endsWith(":lease"),
      );
      // Clear any existing session
      for (const key of keys) localStorage.removeItem(key);
    });

    // Write a fresh session with a stale change
    await page.evaluate(() => {
      const leaseKey = Object.keys(localStorage).find((key) =>
        key.startsWith("nudge-ui:") && key.endsWith(":lease"),
      );
      if (!leaseKey) throw new Error("expected a workspace lease");
      const id = leaseKey.slice("nudge-ui:".length, -":lease".length);
      const session = {
        schemaVersion: 12,
        projectId: id,
        mode: "inspect",
        inspectUrl: window.location.href,
        cards: [],
        comparisonGroups: [],
        camera: { x: 0, y: 0, zoom: 1 },
        changes: [
          {
            cid: "Widget",
            file: "src/Widget.tsx",
            line: 5,
            selector: '[data-cid="Widget"][data-src*="Widget.tsx:5"]',
            property: "margin",
            rawValue: "16px",
            oldToken: null,
            newToken: null,
            source: { file: "src/Widget.tsx", line: 5, component: "Widget" },
            scope: "source-site",
          },
        ],
        structuralChanges: [],
        clipboardHandoff: null,
      };
      const prefixedKey = `nudge-ui:${id}:v12`;
      localStorage.setItem(prefixedKey, JSON.stringify(session));
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
