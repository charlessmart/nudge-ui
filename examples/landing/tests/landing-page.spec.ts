import { expect, test } from "@playwright/test";

test("embeds the real inspector in the explicit demo frame", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Design where code lives." })).toBeVisible();
  await expect(page.getByText("Try the demo", { exact: true })).toHaveCount(0);
  await expect(page.getByText("localhost:5173/sandbox", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Try the real thing", { exact: true })).toHaveCount(0);

  if (process.env.NUDGE_UI_LANDING_TARGET !== "prod") {
    const parentInspector = page.locator("#nudge-ui-root");
    await expect.poll(() => parentInspector.evaluate((host) => host.shadowRoot !== null)).toBe(true);
    expect(await parentInspector.evaluate((host) => host.shadowRoot?.querySelector('[data-test="mode-canvas"]') !== null)).toBe(true);
  }

  const frame = page.frameLocator('iframe[title="Nudge UI live inspector demo"]');
  await expect(frame.getByTestId("demo-page")).toBeVisible();
  await expect(frame.getByText("Nudge UI demo · Canvas off")).toBeVisible();

  const inspectorHost = frame.locator("#nudge-ui-root");
  await expect.poll(() => inspectorHost.evaluate((host) => host.shadowRoot !== null)).toBe(true);

  const inspectorState = await inspectorHost.evaluate((host) => {
    const shadow = host.shadowRoot;
    return {
      hasPanel: shadow?.querySelector(".panel") !== null,
      hasCanvas: shadow?.querySelector('[data-test="canvas-workspace"]') !== null,
      hasCopyControl: shadow?.querySelector('[data-test="copy-prompt-control"]') !== null,
    };
  });
  expect(inspectorState).toEqual({ hasPanel: true, hasCanvas: false, hasCopyControl: true });
});

test("requires the explicit demo flag on the demo route", async ({ page }) => {
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "This route needs the explicit demo flag." })).toBeVisible();
  const inspectorHost = page.locator("#nudge-ui-root");
  if (await inspectorHost.count() === 1) {
    expect(await inspectorHost.evaluate((host) => host.shadowRoot !== null && host.shadowRoot.querySelector(".panel") !== null)).toBe(false);
  }
});
