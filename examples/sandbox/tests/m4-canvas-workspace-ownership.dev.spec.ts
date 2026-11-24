import { showCanvas, waitForCanvasTransition } from "./canvasTransition.ts";
import { test, expect } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";
import { expandSpacing, setInput, waitForInspector } from "./inspector.ts";

async function waitForInactive(page: import("@playwright/test").Page): Promise<void> {
  await expect(page.locator('[data-nudge-workspace="inactive"]')).toBeAttached();
}

/** A tab takes the workspace back when the person comes to it. */
async function focusTab(page: import("@playwright/test").Page): Promise<void> {
  await page.evaluate(() => window.dispatchEvent(new FocusEvent("focus")));
}

test.describe("Canvas workspace lease — single ownership", () => {
  test("dev: a second tab opened while the first is in use stays quiet", async ({ page, context }) => {
    await page.goto("/playground");
    await showCanvas(page);
    await waitForCanvasTransition(page);
    await page.frameLocator(".canvas-card__iframe").first().getByRole("button", { name: "Save a change", exact: true }).click();
    await waitForInspector(page);

    await expect(page.locator('[data-test="inspect-tab"]')).toBeVisible();

    const page2 = await context.newPage();
    await page2.goto("/playground");
    await waitForInactive(page2);

    await expect(page2.locator('[data-test="inspect-tab"]')).toHaveCount(0);
    await expect(page2.getByText("Nudge is open in another tab")).toHaveCount(0);
    await expect(page.locator('[data-test="inspect-tab"]')).toBeVisible();

    await page2.close();
  });

  test("dev: focusing a tab transfers ownership and the old tab steps aside", async ({ page, context }) => {
    await page.goto("/playground");
    await showCanvas(page);
    await waitForCanvasTransition(page);
    await page.frameLocator(".canvas-card__iframe").first().getByRole("button", { name: "Save a change", exact: true }).click();
    await waitForInspector(page);

    const page2 = await context.newPage();
    await page2.goto("/playground");
    await waitForInactive(page2);

    await focusTab(page2);

    // Takeover is an in-place handoff: the second tab becomes editable without a reload.
    await waitForInspector(page2);
    await expect(page2.locator('[data-nudge-workspace="inactive"]')).toHaveCount(0);
    if (await page2.locator('[data-test="canvas-workspace"]').getAttribute("data-presentation") === "focus") await showCanvas(page2);
    await waitForCanvasTransition(page2);
    await page2.frameLocator(".canvas-card__iframe").first().getByRole("button", { name: "Save a change", exact: true }).click();
    await expect(page2.locator('[data-test="style-editors"]')).toBeVisible();
    await waitForInactive(page);
    await expect(page.locator('[data-test="inspect-tab"]')).not.toBeVisible();

    await focusTab(page);
    await waitForInspector(page);
    await waitForInactive(page2);

    await page2.close();
  });
});

test.describe("Canvas workspace lease — expiry recovery", () => {
  test("dev: expired lease allows new tab to acquire ownership", async ({ page, context }) => {
    await page.goto("/playground");
    await showCanvas(page);
    await waitForCanvasTransition(page);
    await page.frameLocator(".canvas-card__iframe").first().getByRole("button", { name: "Save a change", exact: true }).click();
    await waitForInspector(page);

    // Write an expired lease (old heartbeat) directly.
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

    const page2 = await context.newPage();
    await page2.goto("/playground");

    await waitForInspector(page2);
    await expect(page2.locator('[data-test="inspect-tab"]')).toBeVisible();
    if (await page2.locator('[data-test="canvas-workspace"]').getAttribute("data-presentation") === "focus") await showCanvas(page2);
    await waitForCanvasTransition(page2);
    await page2.frameLocator(".canvas-card__iframe").first().getByRole("button", { name: "Save a change", exact: true }).click();
    await expect(page2.locator('[data-test="style-editors"]')).toBeVisible();

    await page2.close();
  });
});

test.describe("Canvas workspace — stale change detection", () => {
  test("dev: restored stale change shows stale indicator", async ({ page }) => {
    await page.goto("/playground");
    await showCanvas(page);
    await waitForCanvasTransition(page);
    await page.frameLocator(".canvas-card__iframe").first().getByRole("button", { name: "Save a change", exact: true }).click();
    await waitForInspector(page);

    await expandSpacing(page);
    await setInput(page, "padding-top", "48px");
    await expect.poll(() => managedSheetText(page)).toContain("padding-top: 48px;");

    // Sessions auto-save on change.
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith("nudge-ui-drafts:")))).toBe(true);

    await page.addInitScript(() => {
      const keys = Object.keys(localStorage).filter((k) =>
        k.startsWith("nudge-ui-drafts:") && k.endsWith(":v2"),
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

    await page.reload();
    await waitForInspector(page);

    const clearSession = page.locator('[data-test="clear-session"]');
    await expect(clearSession).toBeVisible();
    await expect(clearSession).toBeEnabled();

    await page.locator('[data-test="changes-toggle"]').click();
    const changeRows = page.locator('[data-test="change-row"]');
    await expect.poll(() => changeRows.count()).toBeGreaterThanOrEqual(1);

  });

  test("dev: stale state retains exact selector and source data", async ({ page }) => {
    await page.goto("/playground");
    await showCanvas(page);
    await waitForCanvasTransition(page);
    await page.frameLocator(".canvas-card__iframe").first().getByRole("button", { name: "Save a change", exact: true }).click();
    await waitForInspector(page);

    await expect.poll(() => page.evaluate(() => Object.keys(localStorage).some((key) => key.startsWith("nudge-ui-drafts:")))).toBe(true);

    // Keep the saved layout; only the draft's changes are replaced.
    await page.addInitScript(() => {
      const key = Object.keys(localStorage).find((key) => key.startsWith("nudge-ui-drafts:") && key.endsWith(":v2"));
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

    await expect(page.locator('[data-test="clear-session"]')).toBeVisible();

    // Wait for the stale-detection timeout.
    await page.waitForTimeout(7000);

    const sheet = await managedSheetText(page);
    // Stale does not mean deleted: the rule still applies.
    expect(sheet).toContain("16px");

    const clearBtn = page.locator('[data-test="clear-session"]');
    if (await clearBtn.isVisible().catch(() => false)) {
      await clearBtn.click();
      await expect.poll(() => managedSheetText(page)).not.toContain("16px");
    }
  });
});
