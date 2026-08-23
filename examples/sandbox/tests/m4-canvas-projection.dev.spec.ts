import { test, expect } from "@playwright/test";
import { managedSheetText } from "./managedSheet.ts";

async function managedSheetContent(page: import("@playwright/test").Page): Promise<string> {
  return managedSheetText(page);
}

async function frameManagedSheetContent(
  page: import("@playwright/test").Page,
  iframeSelector: string,
): Promise<string> {
  const frame = page.frameLocator(iframeSelector);
  const text = await frame.locator("#design-tool-styles").textContent();
  return text ?? "";
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

async function expandSpacing(page: import("@playwright/test").Page): Promise<void> {
  const spacing = page.locator('[data-test="spacing-padding"]');
  const add = spacing.locator('[data-test="add-value"]');
  if (await add.count()) await add.click();
  await spacing.locator('[data-test="individual-sides"]').click();
  await expect(spacing).toHaveAttribute("data-expanded", "true");
}

test("dev: element edits project into canvas renderer frame", async ({ page }) => {
  await page.goto("/playground");

  await page.click("text=Save");
  await waitForInspector(page);

  // Make an element edit in Inspect mode
  await expandSpacing(page);
  await setInput(page, "padding-top", "32px");

  // Verify the edit is reflected in the host page
  await expect.poll(() => managedSheetContent(page)).toContain("padding-top: 32px;");

  // Switch to Canvas mode
  await page.locator('[data-test="mode-canvas"]').click();

  // Wait for the canvas workspace and card
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  const board = page.locator('[data-test="canvas-board"]');
  await expect(board.locator(".dt-canvas-card")).toHaveCount(1);

  // Wait for the frame to load (loading state disappears)
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible({
    timeout: 20000,
  });

  // Verify the edit CSS appears in the frame's managed stylesheet
  const frameContent = await frameManagedSheetContent(page, ".dt-canvas-card__iframe");
  expect(frameContent).toContain("padding-top: 32px;");
});

test("dev: canvas element edits survive switching back to Inspect", async ({ page }) => {
  await page.goto("/playground");
  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible({
    timeout: 20000,
  });

  const frame = page.frameLocator(".dt-canvas-card__iframe").first();
  const button = frame.locator("button.btn").first();
  await button.click();
  await expect(page.locator('[data-test="selection"]')).toBeVisible({ timeout: 5000 });

  await expandSpacing(page);
  await setInput(page, "padding-top", "37px");
  await expect.poll(() => button.evaluate((element) => getComputedStyle(element).paddingTop)).toBe("37px");

  await page.locator('[data-test^="canvas-card-preview-"]').first().click();
  await waitForInspector(page);

  const hostButton = page.locator("button.btn").first();
  await expect.poll(() => hostButton.evaluate((element) => getComputedStyle(element).paddingTop)).toBe("37px");
  await expect.poll(() => managedSheetContent(page)).toContain("padding-top: 37px;");
});

test("dev: global token edit projects into canvas frame", async ({ page }) => {
  await page.goto("/playground");

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

  // Verify token edit is in the host managed sheet
  await expect.poll(() => managedSheetContent(page)).toContain("--color-surface-raised: #abcdef;");

  // Switch to Canvas
  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  // Wait for frame to load
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible({
    timeout: 20000,
  });

  // Verify token edit appears in the frame
  const frameContent = await frameManagedSheetContent(page, ".dt-canvas-card__iframe");
  expect(frameContent).toContain("--color-surface-raised: #abcdef;");
});

test("dev: frame reload converges on latest projection", async ({ page }) => {
  await page.goto("/playground");

  await page.click("text=Save");
  await waitForInspector(page);

  // Make a source-site element edit
  await expandSpacing(page);
  await setInput(page, "padding-top", "48px");

  // Switch to Canvas
  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  // Wait for frame to load
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible({
    timeout: 20000,
  });

  // Verify projection in frame
  await expect
    .poll(() => frameManagedSheetContent(page, ".dt-canvas-card__iframe"))
    .toContain("padding-top: 48px;");

  // Reload the frame
  await page.locator('[data-test^="canvas-card-reload-"]').click();

  // Wait for reload (loading state shows and clears)
  await expect(page.locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible({
    timeout: 20000,
  });

  // After reload, the frame should still have the latest projection
  await expect
    .poll(() => frameManagedSheetContent(page, ".dt-canvas-card__iframe"))
    .toContain("padding-top: 48px;");
});

test("dev: reverting the final change projects empty CSS to canvas frame", async ({ page }) => {
  await page.goto("/playground");

  await page.click("text=Save");
  await waitForInspector(page);

  // Make an edit
  await expandSpacing(page);
  await setInput(page, "padding-top", "60px");

  await expect.poll(() => managedSheetContent(page)).toContain("padding-top: 60px;");

  // Switch to Canvas
  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  await expect(page.locator('[data-test^="canvas-card-loading-"]')).not.toBeVisible({
    timeout: 20000,
  });

  // Verify projection
  await expect
    .poll(() => frameManagedSheetContent(page, ".dt-canvas-card__iframe"))
    .toContain("padding-top: 60px;");

  // Switch back to Inspect and clear changes
  await page.locator('[data-test^="canvas-card-preview-"]').first().click();
  await waitForInspector(page);

  await page.locator('[data-test="changes-toggle"]').click();
  await page.locator(
    '[data-test="change-revert"][data-property="padding-top"]',
  ).click();

  // Verify host sheet is cleared
  await expect.poll(() => managedSheetContent(page)).not.toContain("padding-top: 60px;");

  // Switch back to Canvas
  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  // Use the already-loaded frame
  const frameContent = await frameManagedSheetContent(page, ".dt-canvas-card__iframe");
  // After clearing, the projection should not have the old rule
  expect(frameContent).not.toContain("padding-top: 60px;");
});

test("dev: canvas renderer protocol is present in dev mode", async ({ page }) => {
  await page.goto("/playground");

  // In dev mode, the Canvas action should be present
  await expect(page.locator('[data-test="mode-canvas"]')).toBeVisible();
});
