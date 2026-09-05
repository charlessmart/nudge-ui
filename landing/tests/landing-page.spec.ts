import { expect, test } from "@playwright/test";

test("runs the real inspector on the landing document", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Nudge is for designing in code." })).toBeVisible();
  await expect(page.getByText("Try the demo", { exact: true })).toHaveCount(0);
  await expect(page.getByText("localhost:5173/sandbox", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Try the real thing", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Demo", exact: true })).toBeVisible();
  const setup = page.getByRole("region", { name: "Installation" });
  await expect(setup).toBeVisible();
  await expect(setup.locator("pre")).toHaveCount(4);
  await expect(setup.getByText("pnpm add -D @nudge-ui/plugin", { exact: true })).toBeVisible();
  await expect(setup.getByText("Install @nudge-ui/plugin in this project", { exact: true })).toBeVisible();
  await expect(setup.getByText("vite.config.ts", { exact: true })).toBeVisible();
  await expect(setup.getByText("nudge_listen", { exact: true })).toBeVisible();
  await expect(page.getByText("Made for design engineers.", { exact: true })).toHaveCount(0);
  await expect(page.locator("iframe")).toHaveCount(0);
  const demo = page.locator("section#demo");
  await expect(demo.getByText("Open Nudge and try the loop yourself: select any element on this page, make a small change, and see it immediately.", { exact: true })).toBeVisible();
  const openNudge = demo.getByRole("button", { name: "Open Nudge" });
  await expect(openNudge).toBeVisible();
  await expect(page.locator("header.landing-nav")).toHaveCount(0);
  const footer = page.locator("footer.landing-footer");
  await expect(footer.getByText("Nudge UI", { exact: true })).toBeVisible();
  await expect(footer.getByRole("link", { name: "Nudge UI on GitHub" })).toHaveAttribute("href", "https://github.com/charlessmart/nudge-ui");
  await expect(footer.getByRole("link", { name: "Made by Charles" })).toHaveAttribute("href", "https://twitter.com/CharlesMSmart");
  await expect(footer.getByText("dev-only by design", { exact: false })).toHaveCount(0);
  await expect(footer.getByText("data-cid", { exact: false })).toHaveCount(0);

  const inspectorHost = page.locator("#nudge-ui-root");
  await expect.poll(() => inspectorHost.evaluate((host) => host.shadowRoot !== null)).toBe(true);

  const collapsedState = await inspectorHost.evaluate((host) => {
    const shadow = host.shadowRoot;
    return {
      panelOpen: shadow?.querySelector(".panel")?.getAttribute("data-open"),
      hasRestoreButton: shadow?.querySelector('[data-test="show-inspector"]') !== null,
      hasCanvas: shadow?.querySelector('[data-test="canvas-workspace"]') !== null,
      hasCopyControl: shadow?.querySelector('[data-test="copy-prompt-control"]') !== null,
    };
  });
  expect(collapsedState).toEqual({ panelOpen: "false", hasRestoreButton: true, hasCanvas: false, hasCopyControl: true });

  await openNudge.click();
  await expect.poll(() => inspectorHost.evaluate((host) => host.shadowRoot?.querySelector(".panel")?.getAttribute("data-open"))).toBe("true");
  await expect(inspectorHost.locator('[data-test="show-inspector"]')).toHaveCount(0);

  await page.locator("#landing-hero-title").click();
  await expect(inspectorHost.locator('[data-test="empty-state"]')).toHaveCount(0);
});

test("keeps the unflagged demo route disabled during development", async ({ page }) => {
  test.skip(process.env.NUDGE_UI_LANDING_TARGET === "prod", "The explicit nudge-demo artifact makes the landing document the demo surface.");
  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "This route needs the explicit demo flag." })).toBeVisible();
  const inspectorHost = page.locator("#nudge-ui-root");
  if (await inspectorHost.count() === 1) {
    expect(await inspectorHost.evaluate((host) => host.shadowRoot !== null && host.shadowRoot.querySelector(".panel") !== null)).toBe(false);
  }
});

test("renders demo videos as vertical sections", async ({ page }) => {
  await page.goto("/");

  const showcase = page.locator("section.landing-showcase");
  const items = showcase.locator(".landing-showcase-item");
  await expect(items).toHaveCount(3);
  await expect(showcase.getByRole("tablist")).toHaveCount(0);
  await expect(showcase.locator("[role=tabpanel]")).toHaveCount(0);
  await expect(items.nth(0).getByRole("heading", { name: "Edit directly for fast visual iteration" })).toBeVisible();
  await expect(items.nth(1).getByRole("heading", { name: "Use the canvas to explore variations" })).toBeVisible();
  await expect(items.nth(2).getByRole("heading", { name: "Keep tokens and components in sync" })).toBeVisible();
  await expect(items.nth(0).getByText("I got tired of asking an agent for tiny visual changes, waiting for the update, and then finding one more thing to fix. Nudge lets me make those adjustments directly on the page.", { exact: true })).toBeVisible();
  await expect(items.nth(1).getByText("Figma is still easier to refine in because you can try an idea and see it immediately. The canvas gives that same room to explore without leaving the code that is becoming the product.", { exact: true })).toBeVisible();
  await expect(items.nth(2).getByText("An engineer's proof of concept often becomes the real product surface a designer needs to refine. Keeping the real tokens and components in the loop means the polish lands where the product actually lives.", { exact: true })).toBeVisible();
  await expect(showcase.getByText("Share and review changes", { exact: true })).toHaveCount(0);
  await expect(items.locator("video")).toHaveCount(3);
  await expect(items.locator(".landing-showcase-placeholder")).toHaveCount(3);
});
