import { test, expect } from "@playwright/test";

test("dev: inspector shell mounts in Shadow DOM and toggles via Alt+I", async ({ page }) => {
  await page.goto("/");

  const hasMount = await page.evaluate(() => {
    const el = document.getElementById("design-tool-root");
    return el !== null;
  });
  expect(hasMount).toBe(true);

  const hasShadow = await page.evaluate(() => {
    return document.getElementById("design-tool-root")?.shadowRoot !== null;
  });
  expect(hasShadow).toBe(true);

  const hasShellText = await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    return sr?.textContent ?? "";
  });
  expect(hasShellText).not.toContain("Inspector shell ready");
  await expect(page.locator('[data-test="copy-prompt"]')).toBeDisabled();
  await expect(page.locator('[data-test="copy-prompt"]')).toHaveClass(/dt-button--primary/);
  await expect(page.locator('[data-test="mode-canvas"] svg')).toHaveClass(/tabler-icon-artboard/);
  await expect(page.locator('[data-test="inspect-tab"]')).not.toHaveClass(/dt-button--secondary|dt-button--quiet/);
  await expect(page.locator('[data-test="tokens-tab"]')).toHaveClass(/dt-button--quiet/);
  const headerState = await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const header = sr?.querySelector('[data-test="inspect-tab"]');
    const actions = header?.querySelector(".dt-panel__header-actions");
    return {
      background: header ? getComputedStyle(header).backgroundColor : null,
      actions: actions
        ? Array.from(actions.children)
          .map((child) => child.getAttribute("data-test"))
          .filter((value): value is string => value !== null)
        : [],
      hasDivider: header?.querySelector(".dt-panel__header-divider") !== null,
    };
  });
  expect(headerState.background).toBe("rgba(0, 0, 0, 0)");
  expect(headerState.actions).toEqual(["tokens-tab", "mode-canvas"]);
  expect(headerState.hasDivider).toBe(true);
  const copyRowInset = await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const tabs = sr?.querySelector(".dt-panel__tabs");
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
  await expect(page.locator('[data-test="copy-prompt-menu"]')).toBeDisabled();

  const getOpen = () =>
    page.evaluate(
      () =>
        document
          .getElementById("design-tool-root")
          ?.shadowRoot?.querySelector(".dt-panel")
          ?.getAttribute("data-open") ?? null,
    );

  const before = await getOpen();
  const reservedWidth = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;
    return {
      layoutOpen: root.getAttribute("data-design-tool-panel"),
      bodyMarginRight: getComputedStyle(body).marginRight,
    };
  });
  expect(reservedWidth.layoutOpen).toBe("open");
  expect(reservedWidth.bodyMarginRight).not.toBe("0px");

  await page.keyboard.press("Alt+i");
  const afterToggle = await getOpen();
  expect(afterToggle).not.toBe(before);
  await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute("data-design-tool-panel"))).toBe(false);

  await page.keyboard.press("Alt+i");
  const afterSecond = await getOpen();
  expect(afterSecond).toBe(before);
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-design-tool-panel"))).toBe("open");

  await page.locator('[data-test="tokens-tab"]').click();
  await expect(page.locator('[data-test="tokens-tab"]')).toHaveClass(/dt-button--secondary/);
  await expect(page.locator('[data-test="inspect-tab"]')).not.toHaveClass(/dt-button--secondary|dt-button--quiet/);
});

test("dev: inspector can collapse and reopen from its icon controls on a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const panel = page.locator(".dt-panel");
  await expect(panel).toHaveAttribute("data-open", "true");
  await page.locator('[data-test="collapse-inspector"]').click();
  await expect(panel).toHaveAttribute("data-open", "false");
  await expect(page.locator('[data-test="show-inspector"]')).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.hasAttribute("data-design-tool-panel"))).toBe(false);

  await page.locator('[data-test="show-inspector"]').click();
  await expect(panel).toHaveAttribute("data-open", "true");
  await expect.poll(() => page.evaluate(() => document.documentElement.getAttribute("data-design-tool-panel"))).toBe("open");
});

test("dev: inspector header scrolls with the editor content", async ({ page }) => {
  await page.goto("/");
  await page.click("text=Save");
  await expect(page.locator('[data-test="style-editors"]')).toBeVisible();

  const scrollState = await page.evaluate(() => {
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const panel = sr?.querySelector(".dt-panel") as HTMLElement | null;
    const body = sr?.querySelector(".dt-panel__body") as HTMLElement | null;
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
