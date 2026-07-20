import { test, expect } from "@playwright/test";

/**
 * Cross-iframe element selection. These tests exercise the path where the
 * user clicks a tracked element (`[data-cid]`) inside a canvas-card iframe
 * and the inspector should populate with the right component. Behaviours
 * under test:
 *
 * 1. Clicking a plain tracked element (heading, button, paragraph) inside a
 *    single-card canvas selects it in the inspector without unmounting the
 *    workspace.
 * 2. Clicking a same-origin anchor (`<a href="/tailwind">`) that has been
 *    authored inside a tracked React component still spawns a new card, so
 *    users can navigate from one route to the next without losing canvas.
 * 3. Clicking a tracked element inside a sibling card whose URL differs from
 *    the parent's route must NOT navigate the parent page away from canvas
 *    mode (regression: `selectCard` used to call `window.location.href = ...`
 *    whenever the card URL didn't match the host's URL).
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
});

async function waitForIframeReady(page: import("@playwright/test").Page, index = 0): Promise<void> {
  await expect(page.locator(".dt-canvas-card__iframe").nth(index)).toBeAttached();
  const frame = page.frameLocator(".dt-canvas-card__iframe").nth(index);
  await expect(frame.locator("body")).toBeVisible({ timeout: 20000 });
}

test("dev: clicking a tracked non-anchor element inside an iframe selects it in the inspector", async ({ page }) => {
  await waitForIframeReady(page, 0);

  const frame = page.frameLocator(".dt-canvas-card__iframe").first();
  const heading = frame.locator("#hero-title");
  await expect(heading).toBeVisible();
  const headingCid = await heading.getAttribute("data-cid");

  await heading.click();

  await expect(page.locator('[data-test="selection"]')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('[data-test="selection"]')).toHaveAttribute(
    "data-selected-cid", headingCid as string,
  );
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  expect(page.url()).toMatch(/\/$/);
});

test("dev: clicking a Button component tracked element shows the Button component in the inspector", async ({ page }) => {
  await waitForIframeReady(page, 0);

  const frame = page.frameLocator(".dt-canvas-card__iframe").first();
  const button = frame.locator('button.btn').first();
  await expect(button).toBeVisible();
  const buttonCid = await button.getAttribute("data-cid");
  expect(buttonCid).toBe("Button");

  await button.click();

  await expect(page.locator('[data-test="selection"]')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('[data-test="selection"]')).toHaveAttribute("data-selected-cid", "Button");
});

test("dev: clicking a navigable same-origin anchor inside a tracked tree still spawns a new card", async ({ page }) => {
  await waitForIframeReady(page, 0);
  const board = page.locator('[data-test="canvas-board"]');
  await expect(board.locator(".dt-canvas-card")).toHaveCount(1);

  // The Tailwind anchor in the sandbox header carries `data-cid="App"` — a
  // regression previously caused the element-click handler to swallow the
  // click via stopImmediatePropagation, preventing the navigation-intent
  // listener from running. We dispatch a real bubbling MouseEvent here rather
  // than Playwright's locator.click(), because Playwright's bounding-box
  // calculation mis-handles elements inside a CSS-transform-scaled iframe
  // (the iframe is inside the canvas board-content `transform: scale(zoom)`).
  const childFrame = page.frames().find((f) => f !== page.mainFrame());
  expect(childFrame).toBeDefined();
  await childFrame!.evaluate(() => {
    const anchor = document.querySelector<HTMLAnchorElement>('a[href="/tailwind"]');
    if (!anchor) throw new Error("Tailwind link not found in iframe");
    anchor.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  });

  await expect(board.locator(".dt-canvas-card")).toHaveCount(2);
});

test("dev: clicking a tracked element inside a sibling card whose URL differs from the parent does not navigate the parent away from canvas", async ({ page }) => {
  await waitForIframeReady(page, 0);
  const parentUrlBefore = page.url();

  // Create a sibling card with a different URL by simulating a
  // navigation-intent message from inside the first card. Using postMessage
  // here avoids relying on the (just-fixed) anchor navigation path; the goal
  // of this test is the regression around `selectCard` navigating the host.
  await page.evaluate((url) => {
    window.postMessage({
      type: "navigation-intent",
      protocolVersion: 1,
      url,
    }, window.location.origin);
  }, parentUrlBefore.replace(/\/$/, "") + "/tailwind");

  await expect(page.locator(".dt-canvas-card")).toHaveCount(2);
  await waitForIframeReady(page, 1);

  const secondFrame = page.frameLocator(".dt-canvas-card__iframe").nth(1);
  const heading = secondFrame.locator("h1, h2, [data-cid]").first();
  await expect(heading).toBeVisible({ timeout: 20000 });
  const cidBefore = await heading.getAttribute("data-cid");

  await heading.click();
  await page.waitForTimeout(400);

  // Regression check: parent must remain in canvas mode on the original URL.
  expect(page.url()).toBe(parentUrlBefore);
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();

  // And the inspector should have populated with the clicked element's cid.
  if (cidBefore) {
    await expect(page.locator('[data-test="selection"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-test="selection"]')).toHaveAttribute(
      "data-selected-cid", cidBefore,
    );
  }
});