import { expect, test } from "@playwright/test";

test("opens the restricted demo in the shared iframe editor", async ({ page }) => {
  await page.goto("/");
  await expect.poll(() => new URL(page.url()).searchParams.getAll("nudge-ui")).toContain("editor");
  await expect(page.locator("html")).toHaveAttribute("data-nudge-ui-editor", "");
  const inspectorHost = page.locator("#nudge-ui-root");
  await expect.poll(() => inspectorHost.evaluate((host) => host.shadowRoot !== null)).toBe(true);
  const workspace = inspectorHost.locator('[data-test="canvas-workspace"]');
  await expect(workspace).toHaveAttribute("data-presentation", "focus");
  await expect.poll(() => inspectorHost.evaluate((host) => host.shadowRoot?.querySelector(".panel")?.getAttribute("data-open"))).toBe("false");
  await expect(inspectorHost.locator('[data-test="show-inspector"]')).toBeVisible();

  const frames = inspectorHost.locator("iframe[data-nudge-ui-canvas-renderer]");
  await expect(frames).toHaveCount(3);
  const appFrame = frames.first();
  const versionOneFrame = frames.nth(1);
  const versionTwoFrame = frames.nth(2);
  await expect(appFrame).toBeVisible();
  await expect(versionOneFrame).toBeHidden();
  await expect(versionTwoFrame).toBeHidden();
  const app = appFrame.contentFrame();
  const versionOne = versionOneFrame.contentFrame();
  const versionTwo = versionTwoFrame.contentFrame();
  await expect(page.getByRole("heading", { name: "Nudge, a design panel for your codebase." })).toHaveCount(0);
  await expect(app.getByRole("heading", { name: "Nudge, a design panel for your codebase." })).toBeVisible();
  const hero = app.getByRole("region", { name: "Nudge, a design panel for your codebase." });
  await expect(hero.getByText("Run npm create nudge-ui@latest in this project", { exact: true })).toBeVisible();
  await expect(app.getByText("Try the demo", { exact: true })).toHaveCount(0);
  await expect(app.getByRole("heading", { name: "Demo", exact: true })).toBeVisible();
  const setup = app.getByRole("region", { name: "Installation" });
  await expect(setup).toBeVisible();
  await expect(setup.locator("pre")).toHaveCount(4);
  await expect(setup.getByText("npm create nudge-ui@latest", { exact: true })).toBeVisible();
  await expect(setup.getByText("Run npm create nudge-ui@latest in this project", { exact: true })).toBeVisible();
  await expect(setup.locator("pre").filter({ hasText: "nudge-ui/astro" })).toBeVisible();
  await expect(setup.getByText("nudge_listen", { exact: true })).toBeVisible();
  const openSource = app.getByRole("region", { name: "Open source" });
  await expect(openSource).toBeVisible();
  await expect(openSource.getByText("Open source because there are more front-end frameworks and libraries than atoms in the universe. If your project setup isn't supported yet, you can customise and extend to your needs - DIY your own Figma in the browser.", { exact: true })).toBeVisible();
  await expect(openSource.getByRole("link", { name: "View on GitHub" })).toHaveAttribute("href", "https://github.com/charlessmart/nudge-ui");
  await expect(app.getByText("Made for design engineers.", { exact: true })).toHaveCount(0);
  await expect(app.locator(".landing-hero-demo-grid")).toHaveCount(1);
  await expect(app.locator(".landing-hero-demo")).toHaveCount(4);
  await expect(versionOne.locator(".landing-hero-demo-grid")).toHaveCount(0);
  await expect(versionTwo.locator(".landing-hero-demo-grid")).toHaveCount(0);
  await expect(versionOne.getByRole("heading", { name: "Nudge is for designing in code." })).toHaveCount(1);
  await expect(versionTwo.getByRole("heading", { name: "Nudge is a tool for designing in code." })).toHaveCount(1);
  await expect(versionOne.getByText("@nudge-ui/plugin in this project", { exact: false })).toBeVisible();
  await expect(versionTwo.getByText("@nudge-ui/vite-react in this project", { exact: false })).toBeVisible();
  const fidelityDemos = app.locator(".landing-hero-demo-board-layer--full");
  await expect(fidelityDemos.getByText("Add accounts", { exact: true })).toHaveCount(0);
  await expect(fidelityDemos.getByText("Link an institution", { exact: true })).toBeVisible();
  await expect(fidelityDemos.getByText("Stream your health data", { exact: true })).toBeVisible();
  await expect(fidelityDemos.getByText("Text", { exact: true })).toBeVisible();
  await expect(fidelityDemos.getByText("--landing-display", { exact: true })).toBeVisible();
  await expect(fidelityDemos.getByText("86.3 km", { exact: true })).toBeVisible();
  await expect(fidelityDemos.getByText("Secured with 256-bit encryption", { exact: true })).toHaveCount(0);
  const demo = app.locator("section#demo");
  await expect(demo.getByText("Open Nudge and try the loop yourself: select any element on this page, make a small change, and see it immediately.", { exact: true })).toBeVisible();
  const openNudge = demo.getByRole("button", { name: "Open Nudge" });
  await expect(openNudge).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
  const copyInstallPrompt = app.getByRole("button", { name: "Copy install prompt" });
  await copyInstallPrompt.click();
  await expect(app.getByRole("button", { name: "Install prompt copied" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("Run npm create nudge-ui@latest in this project");
  await expect(app.locator("header.landing-nav")).toHaveCount(0);
  const footer = app.locator("footer.landing-footer");
  await expect(footer.getByText("Nudge UI", { exact: true })).toBeVisible();
  await expect(footer.getByRole("link", { name: "Nudge UI on GitHub" })).toHaveAttribute("href", "https://github.com/charlessmart/nudge-ui");
  await expect(footer.getByRole("link", { name: "Made by Charles" })).toHaveAttribute("href", "https://twitter.com/CharlesMSmart");
  await expect(footer.getByText("dev-only by design", { exact: false })).toHaveCount(0);
  await expect(footer.getByText("data-cid", { exact: false })).toHaveCount(0);

  await expect.poll(async () => (await appFrame.getAttribute("src")) ?? "").not.toContain("nudge-ui=editor");
  const sources = await frames.evaluateAll((elements) => elements.map((element) => (
    (element as HTMLIFrameElement).src
  )));
  expect(sources.filter((source) => new URL(source).searchParams.get("landing-version") === "1")).toHaveLength(1);
  expect(sources.filter((source) => new URL(source).searchParams.get("landing-version") === "2")).toHaveLength(1);

  await openNudge.click();
  await expect.poll(() => inspectorHost.evaluate((host) => host.shadowRoot?.querySelector(".panel")?.getAttribute("data-open"))).toBe("true");

  await inspectorHost.locator('[data-test="presentation-canvas"]').click();
  await expect(workspace).toHaveAttribute("data-presentation", "canvas");
  await expect(versionOneFrame).toBeVisible();
  await expect(versionTwoFrame).toBeVisible();
  const cardLabels = await inspectorHost.locator('[data-test^="canvas-card-dimensions-"]').allTextContents();
  expect(cardLabels.sort()).toEqual(["Version 1", "Version 2", "Version 3"]);
  await expect(inspectorHost.locator(".canvas-workspace__board-content")).toHaveCSS(
    "transform",
    /matrix\(1, 0, 0, 1,/,
  );

  const editableDemoText = app.locator(".landing-demo-example-text");
  await editableDemoText.dblclick();
  const inlineEditor = app.locator('[data-inline-editor="true"]');
  await expect(inlineEditor).toHaveText("Edit me");
  await inlineEditor.fill("Edited in iframe");
  await inlineEditor.press("Enter");
  await expect(editableDemoText).toHaveText("Edited in iframe");
  await app.locator("#landing-hero-title").click();
  await expect(inspectorHost.locator('[data-test="empty-state"]')).toHaveCount(0);

  const demoStorageKeys = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("nudge-ui:")));
  expect(demoStorageKeys).toEqual([]);
});

test("opens the editor from an explicit direct application view", async ({ page }) => {
  await page.goto("/?state=one&__nudge_ui_direct=1#demo");

  await expect(page.getByRole("heading", { name: "Nudge, a design panel for your codebase." })).toBeVisible();
  await expect(page.locator("#nudge-ui-root")).toBeEmpty();
  await expect(page.locator("iframe[data-nudge-ui-canvas-renderer]")).toHaveCount(0);

  await page.locator("section#demo").getByRole("button", { name: "Open Nudge" }).click();

  await expect.poll(() => {
    const url = new URL(page.url());
    return {
      direct: url.searchParams.get("__nudge_ui_direct"),
      editor: url.searchParams.get("nudge-ui"),
      state: url.searchParams.get("state"),
      hash: url.hash,
    };
  }).toEqual({ direct: null, editor: "editor", state: "one", hash: "#demo" });
  await expect(page.locator("html")).toHaveAttribute("data-nudge-ui-editor", "");
  await expect(page.locator("#nudge-ui-root").locator('[data-test="show-inspector"]')).toBeVisible();
});

test("reveals the inspector arrow when the demo enters the viewport", async ({ page }) => {
  await page.goto("/");

  const app = page.locator("#nudge-ui-root").locator("iframe[data-nudge-ui-canvas-renderer]").first().contentFrame();
  const demo = app.locator("section#demo");
  const arrow = app.locator(".landing-demo-arrow");
  const tail = arrow.locator(".landing-demo-arrow-tail");
  const head = arrow.locator(".landing-demo-arrow-head");
  await expect(tail).toHaveCSS("clip-path", "inset(100% 0px 0px)");
  await expect(head).toHaveCSS("clip-path", "inset(0px 100% 0px 0px)");

  await demo.scrollIntoViewIfNeeded();
  await expect(tail).toHaveCSS("clip-path", "inset(0px)");
  await expect(head).toHaveCSS("clip-path", "inset(0px)");

  await app.locator("html").evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await expect(tail).toHaveCSS("clip-path", "inset(0px)");
  await expect(head).toHaveCSS("clip-path", "inset(0px)");

  await app.locator("html").evaluate(() => window.scrollTo(0, 0));
  await expect(tail).toHaveCSS("clip-path", "inset(100% 0px 0px)");
  await expect(head).toHaveCSS("clip-path", "inset(0px 100% 0px 0px)");
});

test("renders demo videos as vertical sections", async ({ page }) => {
  await page.goto("/");

  const app = page.locator("#nudge-ui-root").locator("iframe[data-nudge-ui-canvas-renderer]").first().contentFrame();
  const showcase = app.locator("section.landing-showcase");
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
