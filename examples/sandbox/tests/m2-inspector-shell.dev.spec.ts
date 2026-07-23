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
  await expect(page.locator('[data-test="copy-prompt"]')).toHaveClass(/dt-button--disabled/);
  await expect(page.locator('[data-test="copy-prompt"]')).toHaveCSS("background-color", "rgb(243, 243, 243)");
  await expect(page.locator('[data-test="copy-prompt"]')).toHaveCSS("color", "rgb(161, 161, 161)");
  await expect(page.locator('[data-test="inspect-tab"]')).toHaveClass(/dt-button--secondary/);
  await expect(page.locator('[data-test="tokens-tab"]')).toHaveClass(/dt-button--quiet/);

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
  await expect(page.locator('[data-test="inspect-tab"]')).toHaveClass(/dt-button--quiet/);
});

test("dev: header keeps collapse left, copy prompt right, and changes collapsed", async ({ page }) => {
  await page.goto("/");

  const header = page.locator(".dt-panel__header");
  await expect(header.locator('[data-test="collapse-inspector"]')).toHaveCount(1);
  await expect(header.locator('[data-test="copy-prompt"]')).toHaveCount(1);
  await expect(header).not.toContainText("Design Tool");

  const headerOrder = await header.evaluate((element) =>
    Array.from(element.children).map((child) =>
      child.getAttribute("data-test") ?? child.querySelector("[data-test]")?.getAttribute("data-test") ?? "",
    ),
  );
  expect(headerOrder).toEqual(["collapse-inspector", "copy-prompt"]);

  const changes = page.locator('[data-test="changes-log"]');
  expect(await changes.evaluate((element) => element.hasAttribute("open"))).toBe(false);
  await page.locator('[data-test="changes-toggle"]').click();
  expect(await changes.evaluate((element) => element.hasAttribute("open"))).toBe(true);
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
