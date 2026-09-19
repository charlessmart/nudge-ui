import { test, expect } from "@playwright/test";
import { openEditor } from "@nudge-ui/compatibility/playwright";

test("dev: inspector shell mounts in Shadow DOM and toggles from the keyboard", async ({ page }) => {
  await openEditor(page, "/playground");

  const hasMount = await page.evaluate(() => {
    const el = document.getElementById("nudge-ui-root");
    return el !== null;
  });
  expect(hasMount).toBe(true);

  const hasShadow = await page.evaluate(() => {
    return document.getElementById("nudge-ui-root")?.shadowRoot !== null;
  });
  expect(hasShadow).toBe(true);

  const hasShellText = await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    return sr?.textContent ?? "";
  });
  expect(hasShellText).not.toContain("Inspector shell ready");
  await expect(page.locator('[data-test="copy-prompt"]')).toBeDisabled();
  await expect(page.locator('[data-test="copy-prompt"]')).toHaveClass(/button--primary/);
  await expect(page.locator('[data-test="inspect-tab"]')).not.toHaveClass(/button--secondary|button--quiet/);
  await expect(page.locator('[data-test="tokens-button"]')).toHaveClass(/icon-button--quiet/);
  const headerState = await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    const header = sr?.querySelector('[data-test="inspect-tab"]');
    const actions = header?.querySelector(".panel__header-actions");
    return {
      background: header ? getComputedStyle(header).backgroundColor : null,
      actions: actions
        ? Array.from(actions.children)
          .map((child) => child.getAttribute("data-test"))
          .filter((value): value is string => value !== null)
        : [],
    };
  });
  expect(headerState.background).toBe("rgba(0, 0, 0, 0)");
  expect(headerState.actions).toEqual(["tokens-button", "settings-button"]);
  const copyRowInset = await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    const tabs = sr?.querySelector(".panel__tabs");
    const copyRow = sr?.querySelector('[data-test="copy-prompt-control"]');
    return tabs && copyRow ? {
      tabsPaddingLeft: getComputedStyle(tabs).paddingLeft,
      copyRowLeft: copyRow.getBoundingClientRect().left,
      tabsContentLeft: tabs.getBoundingClientRect().left + parseFloat(getComputedStyle(tabs).paddingLeft),
    } : null;
  });
  expect(copyRowInset).not.toBeNull();
  expect(copyRowInset?.tabsPaddingLeft).toBe("24px");
  expect(copyRowInset?.copyRowLeft).toBe(copyRowInset?.tabsContentLeft);
  await expect(page.locator('[data-test="view-mode-toggle"]')).toHaveCount(0);
  await expect(page.locator('[data-test="mode-preview"]')).toHaveCount(0);
  await expect(page.locator('[data-test="copy-prompt-menu"]')).toHaveCount(0);
  await expect(page.locator('[data-test="tokens-panel"]')).toHaveCount(0);

  const getOpen = () =>
    page.evaluate(
      () =>
        document
          .getElementById("nudge-ui-root")
          ?.shadowRoot?.querySelector(".panel")
          ?.getAttribute("data-open") ?? null,
    );

  const before = await getOpen();
  const reservedWidth = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return {
      layoutOpen: root.getAttribute("data-nudge-ui-panel"),
      bodyMarginRight: getComputedStyle(body).marginRight,
    };
  });
  expect(reservedWidth.layoutOpen).toBe("open");
  expect(reservedWidth.bodyMarginRight).toBe("0px");

  await page.keyboard.press("Control+\\");
  const afterToggle = await getOpen();
  expect(afterToggle).not.toBe(before);
  await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute("data-nudge-ui-panel"))).toBe(false);

  await page.keyboard.press("Control+\\");
  const afterSecond = await getOpen();
  expect(afterSecond).toBe(before);
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-nudge-ui-panel"))).toBe("open");

  await page.locator('[data-test="tokens-button"]').click();
  await expect(page.locator('[data-test="settings-dialog"]')).toBeVisible();
  await expect(page.locator('[data-test="settings-section-tokens"]')).toBeVisible();
  await expect(page.locator('[data-test="tokens-panel"]')).toBeVisible();
  await expect(page.locator('[data-test="inspect-tab"]')).not.toHaveClass(/button--secondary|button--quiet/);
});

test("dev: inspector controls respond while the iframe element selector is active", async ({ page }) => {
  // Regression guard: the element selector swallows ordinary application
  // clicks at the document capture phase, but real browser clicks are
  // composed and their propagation path includes the document even when they
  // originate inside the inspector's shadow root. The selector must let
  // inspector-UI clicks through so the panel's own controls keep working.
  await openEditor(page, "/playground");

  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await page.locator('[data-test="settings-button"]').click();
  await expect(page.locator('[data-test="settings-dialog"]')).toBeVisible();
});

test("dev: inspector can collapse and reopen from its icon controls on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openEditor(page, "/playground");

  const panel = page.locator(".panel");
  await expect(panel).toHaveAttribute("data-open", "true");
  await expect(page.locator('[data-test="collapse-inspector"] svg')).toHaveClass(/tabler-icon-layout-sidebar-right/);
  await page.locator('[data-test="collapse-inspector"]').click();
  await expect(panel).toHaveAttribute("data-open", "false");
  await expect(page.locator('[data-test="show-inspector"]')).toBeVisible();
  await expect(page.locator('[data-test="show-inspector"] svg')).toHaveClass(/tabler-icon-layout-sidebar-right/);
  await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute("data-nudge-ui-panel"))).toBe(false);

  await page.locator('[data-test="show-inspector"]').click();
  await expect(panel).toHaveAttribute("data-open", "true");
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-nudge-ui-panel"))).toBe("open");
});

test("dev: inspector header scrolls with the editor content", async ({ page }) => {
  const app = await openEditor(page, "/playground");
  await app.getByRole("button", { name: "Save" }).click();
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();

  const scrollState = await page.evaluate(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    const panel = sr?.querySelector(".panel") as HTMLElement | null;
    const body = sr?.querySelector(".panel__body") as HTMLElement | null;
    const header = sr?.querySelector('[data-test="inspect-tab"]') as HTMLElement | null;
    if (!panel || !body || !header) return null;

    const panelTop = panel.getBoundingClientRect().top;
    panel.scrollTop = panel.scrollHeight;
    return {
      overflowY: getComputedStyle(panel).overflowY,
      bodyOverflowY: getComputedStyle(body).overflowY,
      scrollHeight: panel.scrollHeight,
      clientHeight: panel.clientHeight,
      headerTop: header.getBoundingClientRect().top,
      panelTop,
    };
  });

  expect(scrollState).not.toBeNull();
  expect(scrollState?.overflowY).toBe("auto");
  expect(scrollState?.bodyOverflowY).toBe("visible");
  expect(scrollState?.scrollHeight).toBeGreaterThan(scrollState?.clientHeight ?? 0);
  expect(scrollState?.headerTop).toBeLessThan(scrollState?.panelTop ?? 0);
});
