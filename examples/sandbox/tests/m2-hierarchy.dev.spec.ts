import { test, expect } from "@playwright/test";

async function expectSelectedOverlayToMatch(page: import("@playwright/test").Page, selector: string): Promise<void> {
  await expect.poll(async () => page.evaluate((targetSelector) => {
    const targets = [...document.querySelectorAll<HTMLElement>(targetSelector)];
    const outline = document.getElementById("design-tool-root")?.shadowRoot?.querySelector<HTMLElement>(".dt-selected-outline");
    if (!outline) return false;
    const outlineRect = outline.getBoundingClientRect();
    return targets.some((target) => {
      const targetRect = target.getBoundingClientRect();
      return ["left", "top", "width", "height"].every((key) => (
        Math.abs(targetRect[key as keyof DOMRect] as number - (outlineRect[key as keyof DOMRect] as number)) < 1
      ));
    });
  }, selector)).toBe(true);
}

test("dev: hierarchy stepping still changes the selected element without metadata chrome", async ({ page }) => {
  await page.goto("/");

  await page.click("text=Save");
  await expectSelectedOverlayToMatch(page, "button.btn");

  await page.keyboard.press("ArrowUp");
  await expectSelectedOverlayToMatch(page, '[data-cid="App"]');

  await page.keyboard.press("ArrowDown");
  await expectSelectedOverlayToMatch(page, "button.btn");

  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("ArrowUp");
  await expectSelectedOverlayToMatch(page, '[data-cid="App"]');

  await page.keyboard.press("ArrowUp");
  await expectSelectedOverlayToMatch(page, '[data-cid="App"]');

  const metadataChrome = await page.evaluate(() => {
    const shadow = document.getElementById("design-tool-root")?.shadowRoot;
    return {
      breadcrumb: shadow?.querySelector(".dt-breadcrumb") !== null,
      metadataRows: shadow?.querySelectorAll(".dt-selection__row").length ?? 0,
    };
  });
  expect(metadataChrome).toEqual({ breadcrumb: false, metadataRows: 0 });
});
