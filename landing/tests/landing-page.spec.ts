import { expect, test } from "@playwright/test";

test("runs the real inspector on the landing document", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Nudge is a tool for designing in code." })).toBeVisible();
  const hero = page.getByRole("region", { name: "Nudge is a tool for designing in code." });
  await expect(hero.getByText("Run npm create nudge-ui@latest in this project", { exact: true })).toBeVisible();
  await expect(page.getByText("Try the demo", { exact: true })).toHaveCount(0);
  await expect(page.getByText("localhost:5173/sandbox", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Try the real thing", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Demo", exact: true })).toBeVisible();
  const setup = page.getByRole("region", { name: "Installation" });
  await expect(setup).toBeVisible();
  await expect(setup.locator("pre")).toHaveCount(4);
  await expect(setup.getByText("npm create nudge-ui@latest", { exact: true })).toBeVisible();
  await expect(setup.getByText("Run npm create nudge-ui@latest in this project", { exact: true })).toBeVisible();
  await expect(setup.locator("pre").filter({ hasText: "@nudge-ui/astro" })).toBeVisible();
  await expect(setup.getByText("nudge_listen", { exact: true })).toBeVisible();
  const openSource = page.getByRole("region", { name: "Open source" });
  await expect(openSource).toBeVisible();
  await expect(openSource.getByText("Open source because there are more front-end frameworks and libraries than atoms in the universe. If your project setup isn't supported yet, you can customise and extend to your needs - DIY your own Figma in the browser.", { exact: true })).toBeVisible();
  await expect(openSource.getByRole("link", { name: "View on GitHub" })).toHaveAttribute("href", "https://github.com/charlessmart/nudge-ui");
  await expect(page.getByText("Made for design engineers.", { exact: true })).toHaveCount(0);
  await expect(page.locator(".landing-hero-demo-grid")).toHaveCount(1);
  await expect(page.locator(".landing-hero-demo")).toHaveCount(4);
  await expect(page.locator("iframe")).toHaveCount(0);
  const fidelityDemos = page.locator(".landing-hero-demo-board-layer--full");
  await expect(fidelityDemos.getByText("Add accounts", { exact: true })).toHaveCount(0);
  await expect(fidelityDemos.getByText("Link an institution", { exact: true })).toBeVisible();
  await expect(fidelityDemos.getByText("Stream your health data", { exact: true })).toBeVisible();
  await expect(fidelityDemos.getByText("Text", { exact: true })).toBeVisible();
  await expect(fidelityDemos.getByText("--landing-display", { exact: true })).toBeVisible();
  await expect(fidelityDemos.getByText("86.3 km", { exact: true })).toBeVisible();
  await expect(fidelityDemos.getByText("Secured with 256-bit encryption", { exact: true })).toHaveCount(0);
  const demo = page.locator("section#demo");
  await expect(demo.getByText("Open Nudge and try the loop yourself: select any element on this page, make a small change, and see it immediately.", { exact: true })).toBeVisible();
  const openNudge = demo.getByRole("button", { name: "Open Nudge" });
  await expect(openNudge).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
  const copyInstallPrompt = page.getByRole("button", { name: "Copy install prompt" });
  await copyInstallPrompt.click();
  await expect(page.getByRole("button", { name: "Install prompt copied" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("Run npm create nudge-ui@latest in this project");
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

test("reveals the inspector arrow when the demo enters the viewport", async ({ page }) => {
  await page.goto("/");

  const demo = page.locator("section#demo");
  const arrow = page.locator(".landing-demo-arrow");
  const tail = arrow.locator(".landing-demo-arrow-tail");
  const head = arrow.locator(".landing-demo-arrow-head");
  await expect(tail).toHaveAttribute("src", /arrow-tail\.svg/);
  await expect(head).toHaveAttribute("src", /arrow-head\.svg/);
  await expect(tail).toHaveCSS("clip-path", "inset(100% 0px 0px)");
  await expect(head).toHaveCSS("clip-path", "inset(0px 100% 0px 0px)");

  await demo.scrollIntoViewIfNeeded();
  await expect(tail).toHaveCSS("clip-path", "inset(0px)");
  await expect(head).toHaveCSS("clip-path", "inset(0px)");

  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(tail).toHaveCSS("clip-path", "inset(0px)");
  await expect(head).toHaveCSS("clip-path", "inset(0px)");

  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(tail).toHaveCSS("clip-path", "inset(100% 0px 0px)");
  await expect(head).toHaveCSS("clip-path", "inset(0px 100% 0px 0px)");
});

test("renders demo videos as vertical sections", async ({ page }) => {
  await page.goto("/");

  const showcase = page.locator("section.landing-showcase");
  const items = showcase.locator(".landing-showcase-item");
  await expect(items).toHaveCount(3);
  await expect(showcase.getByRole("tablist")).toHaveCount(0);
  await expect(showcase.locator("[role=tabpanel]")).toHaveCount(0);
  await expect(items.nth(0).getByRole("heading", { name: "Edit UI directly" })).toBeVisible();
  await expect(items.nth(1).getByRole("heading", { name: "A canvas for exploring variations" })).toBeVisible();
  await expect(items.nth(2).getByRole("heading", { name: "Keep tokens and components in sync" })).toBeVisible();
  await expect(items.nth(0).getByText("Prompting an agent to make UI changes feels like backseat driving. You ask for a tiny visual change, wait for the update, only to realise it looked better before. Editing directly gives you the immediate feedback so that you know if you're making the right decision.", { exact: true })).toBeVisible();
  await expect(items.nth(0).locator(".landing-showcase-item-bullets")).toHaveText("Change stylesMove and delete elementsEdit text");
  await expect(items.nth(0).locator(".landing-showcase-item-bullets svg")).toHaveCount(3);
  await expect(items.nth(1).getByText("Open different pages in a canvas view to compare variations, screen sizes or overall flows. Generate 3 different options, pick one, refine the details immediately to get it feeling right.\n\nDesigning in a terminal? No, you can pry canvas UX out of my cold, dead hands.", { exact: true })).toBeVisible();
  await expect(items.nth(2).getByText("It's your real code base, so use the tokens and components that exist already. Avoid agents churning out custom CSS for every button.", { exact: true })).toBeVisible();
  await expect(showcase.getByText("Share and review changes", { exact: true })).toHaveCount(0);
  await expect(items.locator("video")).toHaveCount(0);
  await expect(items.locator(".landing-showcase-placeholder")).toHaveCount(3);
  await expect(items.locator(".landing-showcase-placeholder-image")).toHaveCount(3);
  await expect(items.nth(0).locator(".landing-showcase-placeholder")).toHaveCSS("transition-duration", "0.5s");
  await expect(items.locator(".landing-showcase-browser-bar")).toHaveCount(3);
  await expect(items.locator(".landing-showcase-browser-dot")).toHaveCount(9);
  await expect(items.locator(".landing-showcase-browser-url")).toHaveText(["localhost", "localhost", "localhost"]);
  await expect(showcase.getByText("Recording coming soon", { exact: true })).toHaveCount(0);
  await expect(items.nth(0).locator(".landing-showcase-placeholder-image")).toHaveAttribute("src", /screen-1/);
  await expect(items.nth(1).locator(".landing-showcase-placeholder-image")).toHaveAttribute("src", /screen-2/);
  await expect(items.nth(2).locator(".landing-showcase-placeholder-image")).toHaveAttribute("src", /screen-3/);

  for (const [index, item] of (await items.all()).entries()) {
    const videoContainer = item.locator(".landing-showcase-video");
    await videoContainer.evaluate(async (element) => {
      document.documentElement.style.scrollBehavior = "auto";
      for (let attempt = 0; attempt < 8; attempt += 1) {
        const rect = element.getBoundingClientRect();
        const targetScrollY = window.scrollY + rect.top - (window.innerHeight - rect.height) / 2;
        window.scrollTo(0, targetScrollY);
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
        await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
      }
    });
    await expect(item.locator("video")).toHaveCount(1);
    if (index === 0) {
      await expect.poll(() => videoContainer.evaluate((element) => element.getBoundingClientRect().width)).toBeGreaterThan(650);
      await expect.poll(() => videoContainer.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(1000);
      await expect.poll(() => videoContainer.evaluate((element) => getComputedStyle(element).opacity)).toBe("1");
      await expect(item.locator(".landing-showcase-video-element")).toHaveCSS("transition-duration", "0.5s");
    }
  }

  const firstVideoContainer = items.nth(0).locator(".landing-showcase-video");
  await firstVideoContainer.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect.poll(() => firstVideoContainer.evaluate((element) => element.getBoundingClientRect().width)).toBe(650);
  await expect.poll(() => firstVideoContainer.evaluate((element) => getComputedStyle(element).opacity)).toBe("0.5");
});
