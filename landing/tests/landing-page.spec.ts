import { expect, test, type Locator } from "@playwright/test";

/** Leaves Focus for the Canvas by unticking View in focus in the toolbar's zoom menu. */
async function showCanvas(inspectorHost: Locator): Promise<void> {
  await inspectorHost.locator('[data-test="canvas-zoom-menu"]').click();
  await inspectorHost.locator('[data-test="canvas-zoom-focus"]').click();
}

const panelOpen = (inspectorHost: Locator) => inspectorHost.evaluate((host) => host.shadowRoot?.querySelector(".panel")?.getAttribute("data-open"));

test("renders the landing page in the top document for crawlers", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1, name: "Nudge, a design panel for your codebase." })).toBeVisible();
  expect(new URL(page.url()).searchParams.getAll("nudge-ui")).toEqual([]);
  await expect(page.locator("html")).not.toHaveAttribute("data-nudge-ui-editor", "");
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://nudgeui.com/");
  await expect(page.locator('meta[name="robots"]')).toHaveCount(0);
  await expect(page.locator("#nudge-ui-root")).toBeEmpty();

  const hero = page.locator("section.landing-hero");
  await expect(hero.getByRole("button", { name: "Try it here" })).toBeVisible();
  await expect(hero.getByRole("link", { name: "Add to Chrome" })).toHaveCount(0);
  await expect(hero.getByRole("link", { name: "Install" })).toHaveAttribute("href", "#install");

  const install = page.locator("section#install");
  await expect(install.getByRole("link", { name: "Add to Chrome" })).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
  await install.getByRole("button", { name: "Copy install prompt" }).click();
  await expect(install.getByRole("button", { name: "Install prompt copied" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("Run npm create nudge-ui@latest in this project");
});

test("serves crawlers that do not run scripts the same heading, description and install links", async ({ page, request }) => {
  const html = await (await request.get("/")).text();
  const fallback = /<noscript>([\s\S]*?)<\/noscript>/.exec(html)?.[1] ?? "";
  await page.goto("/");

  const heading = await page.getByRole("heading", { level: 1 }).innerText();
  const description = await page.locator('meta[name="description"]').getAttribute("content");
  expect(fallback).toContain(`<h1>${heading}</h1>`);
  expect(fallback).toContain(description);
  const links = await page.locator("section#install a[href^='https://']").evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute("href")));
  for (const href of links) expect(fallback).toContain(`href="${href}"`);
});

test("advertises the sitemap to crawlers", async ({ request }) => {
  const robots = await request.get("/robots.txt");
  expect(await robots.text()).toContain("Sitemap: https://nudgeui.com/sitemap.xml");
  const sitemap = await request.get("/sitemap.xml");
  expect(await sitemap.text()).toContain("<loc>https://nudgeui.com/</loc>");
});

test("keeps design explorations out of the index", async ({ page }) => {
  await page.goto("/hero");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
});

test("loads the inspector only when a visitor opens Nudge", async ({ page }) => {
  // The dev server injects the inspector into every document, so only the production build defers it.
  test.skip(process.env.NUDGE_UI_LANDING_TARGET === "dev", "The dev server always loads the inspector.");
  const inspectorRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("nudge-ui-inspector")) inspectorRequests.push(request.url());
  });

  await page.goto("/", { waitUntil: "networkidle" });
  expect(inspectorRequests).toEqual([]);

  await page.locator("section.landing-hero").getByRole("button", { name: "Try it here" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.getAll("nudge-ui")).toContain("editor");
  await expect.poll(() => inspectorRequests.length).toBeGreaterThan(0);
});

test("opens the restricted demo in the shared iframe editor from Try it here", async ({ page }) => {
  await page.goto("/");
  await page.locator("section.landing-hero").getByRole("button", { name: "Try it here" }).click();

  await expect.poll(() => new URL(page.url()).searchParams.getAll("nudge-ui")).toContain("editor");
  await expect(page.locator("html")).toHaveAttribute("data-nudge-ui-editor", "");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex");
  const inspectorHost = page.locator("#nudge-ui-root");
  await expect.poll(() => inspectorHost.evaluate((host) => host.shadowRoot !== null)).toBe(true);
  const workspace = inspectorHost.locator('[data-test="canvas-workspace"]');
  await expect(workspace).toHaveAttribute("data-presentation", "focus");
  await expect.poll(() => panelOpen(inspectorHost)).toBe("true");
  await expect(inspectorHost.getByRole("button", { name: "Use app normally", exact: true })).toHaveAttribute("aria-pressed", "true");

  const frames = inspectorHost.locator("iframe[data-nudge-ui-canvas-renderer]");
  await expect(frames).toHaveCount(3);
  const appFrame = frames.first();
  const versionOneFrame = frames.nth(1);
  const versionTwoFrame = frames.nth(2);
  await expect(appFrame).toBeVisible();
  await expect(versionOneFrame).toBeHidden();
  await expect(versionTwoFrame).toBeHidden();
  const app = appFrame.contentFrame();
  await expect(page.getByRole("heading", { name: "Nudge, a design panel for your codebase." })).toHaveCount(0);
  await expect(app.getByRole("heading", { name: "Nudge, a design panel for your codebase." })).toBeVisible();
  await expect(app.locator(".landing-hero-demo-grid")).toHaveCSS("position", "absolute");
  await expect.poll(async () => (await appFrame.getAttribute("src")) ?? "").not.toContain("nudge-ui=editor");
  const sources = await frames.evaluateAll((elements) => elements.map((element) => (
    (element as HTMLIFrameElement).src
  )));
  expect(sources.filter((source) => new URL(source).searchParams.get("landing-version") === "1")).toHaveLength(1);
  expect(sources.filter((source) => new URL(source).searchParams.get("landing-version") === "2")).toHaveLength(1);

  await showCanvas(inspectorHost);
  await expect(workspace).toHaveAttribute("data-presentation", "canvas");
  await expect(versionOneFrame).toBeVisible();
  await expect(versionTwoFrame).toBeVisible();
  // Iterations write filesystem artifacts, so the landing config enables them for the dev server only.
  if (process.env.NUDGE_UI_LANDING_TARGET !== "dev") {
    await expect(inspectorHost.locator('[data-test^="canvas-card-create-iteration-"]')).toHaveCount(0);
  }
  await inspectorHost.getByRole("button", { name: "Select", exact: true }).click();
  const editableDemoText = app.locator(".landing-bento-text-heading");
  await editableDemoText.dblclick();
  const inlineEditor = app.locator('[data-inline-editor="true"]');
  await expect(inlineEditor).toHaveText("Try it out");
  await inlineEditor.fill("Edited in iframe");
  await inlineEditor.press("Enter");
  await expect(editableDemoText).toHaveText("Edited in iframe");
  await app.locator("#landing-hero-title").click();
  await expect(inspectorHost.locator('[data-test="empty-state"]')).toHaveCount(0);

  await inspectorHost.locator('[data-test="canvas-tool-sketch"]').click();
  const sketchBounds = await appFrame.boundingBox();
  if (!sketchBounds) throw new Error("The app frame is not rendered.");
  await page.mouse.move(sketchBounds.x + sketchBounds.width / 2, sketchBounds.y + sketchBounds.height / 2);
  await page.mouse.down();
  await page.mouse.move(sketchBounds.x + sketchBounds.width / 2 + 40, sketchBounds.y + sketchBounds.height / 2 + 30, { steps: 5 });
  await page.mouse.up();
  // Marks stay on the frame once the sketch tool closes.
  await page.keyboard.press("Escape");
  await expect(inspectorHost.locator('[data-test="sketch-marks"]')).toBeVisible();

  // The public demo must leave nothing behind in visitors' browsers, including anything flushed when the page unloads.
  await page.evaluate(() => window.dispatchEvent(new Event("beforeunload")));
  const demoStorage = await page.evaluate(async () => ({
    local: Object.keys(localStorage),
    session: Object.keys(sessionStorage),
    indexedDb: (await indexedDB.databases()).map((database) => database.name),
  }));
  expect(demoStorage).toEqual({ local: [], session: [], indexedDb: [] });
});

test("opens a refreshed editor collapsed until the page asks for the panel", async ({ page }) => {
  await page.goto("/?nudge-ui=editor");
  const inspectorHost = page.locator("#nudge-ui-root");
  await expect.poll(() => inspectorHost.evaluate((host) => host.shadowRoot !== null)).toBe(true);
  await expect.poll(() => panelOpen(inspectorHost)).toBe("false");
  await expect(inspectorHost.locator('[data-test="show-inspector"]')).toBeVisible();

  const app = inspectorHost.locator("iframe[data-nudge-ui-canvas-renderer]").first().contentFrame();
  await app.locator("section#demo").getByRole("button", { name: "Open Nudge" }).click();
  await expect.poll(() => panelOpen(inspectorHost)).toBe("true");
  expect(new URL(page.url()).searchParams.getAll("nudge-ui")).toEqual(["editor"]);
});

test("does not undo the seeded landing versions", async ({ page }) => {
  await page.goto("/?nudge-ui=editor");
  const inspectorHost = page.locator("#nudge-ui-root");
  await expect.poll(() => inspectorHost.evaluate((host) => host.shadowRoot !== null)).toBe(true);
  await inspectorHost.locator('[data-test="show-inspector"]').click();
  const frames = inspectorHost.locator("iframe[data-nudge-ui-canvas-renderer]");
  await expect(frames).toHaveCount(3);

  await page.locator("html").press("ControlOrMeta+z");

  await expect(frames).toHaveCount(3);
  expect(new URL(page.url()).searchParams.get("landing-version")).toBeNull();
  await expect(frames.first()).toBeVisible();
});

test("keeps the final landing card after refreshing a focused historical version", async ({ page }) => {
  await page.goto("/?nudge-ui=editor");
  const inspectorHost = page.locator("#nudge-ui-root");
  await expect.poll(() => inspectorHost.evaluate((host) => host.shadowRoot !== null)).toBe(true);
  const workspace = inspectorHost.locator('[data-test="canvas-workspace"]');
  await inspectorHost.locator('[data-test="show-inspector"]').click();
  await showCanvas(inspectorHost);
  await inspectorHost.getByRole("button", { name: "Select", exact: true }).click();

  // The open panel can cover a frame's hover chrome, so the frame's focus action is triggered directly.
  const versionOneCard = inspectorHost.getByRole("group", { name: "Frame: V1", exact: true });
  await versionOneCard.locator('[data-test^="canvas-card-focus-"]').dispatchEvent("click");
  await expect(workspace).toHaveAttribute("data-presentation", "focus");
  await expect.poll(() => new URL(page.url()).searchParams.get("landing-version")).toBe("1");

  await page.reload();
  const restoredHost = page.locator("#nudge-ui-root");
  await expect.poll(() => restoredHost.evaluate((host) => host.shadowRoot !== null)).toBe(true);
  await restoredHost.locator('[data-test="show-inspector"]').click();
  await expect(restoredHost.locator('[data-test="canvas-workspace"]')).toHaveAttribute("data-presentation", "focus");
  await restoredHost.locator('[data-test="canvas-zoom-menu"]').click();
  await restoredHost.locator('[data-test="canvas-zoom-focus"]').click();
  await expect(restoredHost.locator('[data-test="canvas-workspace"]')).toHaveAttribute("data-presentation", "canvas");

  const restoredLabels = await restoredHost.locator("[data-card-id]").evaluateAll((cards) => cards.map((card) => card.getAttribute("aria-label")));
  expect(restoredLabels.sort()).toEqual(["Frame: Final", "Frame: V1", "Frame: V2"]);
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
  await expect.poll(() => panelOpen(page.locator("#nudge-ui-root"))).toBe("true");
});

test("loads the showcase video as it enters the viewport", async ({ page }) => {
  await page.goto("/");

  const showcase = page.locator("section.landing-showcase");
  const videoContainer = showcase.locator(".landing-showcase-video");
  await expect(videoContainer).toHaveCount(1);
  await expect(showcase.locator("video")).toHaveCount(0);

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
  await expect(showcase.locator("video")).toHaveCount(1);
});
