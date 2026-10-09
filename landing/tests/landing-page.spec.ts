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
  await expect(page.getByRole("heading", { name: "Nudge, a design panel for your codebase." })).toHaveCount(0);
  await expect(app.getByRole("heading", { name: "Nudge, a design panel for your codebase." })).toBeVisible();
  const demo = app.locator("section#demo");
  const openNudge = demo.getByRole("button", { name: "Open Nudge" });
  await expect(openNudge).toBeVisible();
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(page.url()).origin });
  const useAppNormally = inspectorHost.getByRole("button", { name: "Use app normally", exact: true });
  const copyInstallPrompt = app.getByRole("button", { name: "Copy install prompt" });
  await copyInstallPrompt.click();
  await expect(app.getByRole("button", { name: "Install prompt copied" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("Run npm create nudge-ui@latest in this project");
  await expect.poll(async () => (await appFrame.getAttribute("src")) ?? "").not.toContain("nudge-ui=editor");
  const sources = await frames.evaluateAll((elements) => elements.map((element) => (
    (element as HTMLIFrameElement).src
  )));
  expect(sources.filter((source) => new URL(source).searchParams.get("landing-version") === "1")).toHaveLength(1);
  expect(sources.filter((source) => new URL(source).searchParams.get("landing-version") === "2")).toHaveLength(1);

  await openNudge.click();
  await expect.poll(() => inspectorHost.evaluate((host) => host.shadowRoot?.querySelector(".panel")?.getAttribute("data-open"))).toBe("true");
  await expect(useAppNormally).toHaveAttribute("aria-pressed", "true");

  await inspectorHost.getByRole("button", { name: "Canvas", exact: true }).click();
  await expect(workspace).toHaveAttribute("data-presentation", "canvas");
  await expect(versionOneFrame).toBeVisible();
  await expect(versionTwoFrame).toBeVisible();
  await expect(inspectorHost.locator('[data-test^="canvas-card-create-iteration-"]')).toHaveCount(0);
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

  const demoStorageKeys = await page.evaluate(() => Object.keys(localStorage).filter((key) => key.startsWith("nudge-ui:")));
  expect(demoStorageKeys).toEqual([]);
});

test("keeps the final landing card after refreshing a focused historical version", async ({ page }) => {
  await page.goto("/");
  const inspectorHost = page.locator("#nudge-ui-root");
  await expect.poll(() => inspectorHost.evaluate((host) => host.shadowRoot !== null)).toBe(true);
  const workspace = inspectorHost.locator('[data-test="canvas-workspace"]');
  await inspectorHost.locator('[data-test="show-inspector"]').click();
  await inspectorHost.getByRole("button", { name: "Canvas", exact: true }).click();
  await inspectorHost.getByRole("button", { name: "Select", exact: true }).click();

  const versionOneCard = inspectorHost
    .locator('[data-test^="canvas-card-dimensions-"]')
    .filter({ hasText: "V1" })
    .locator("xpath=ancestor::*[@data-card-id][1]");
  const boardBounds = await inspectorHost.locator('[data-test="canvas-board"]').boundingBox();
  const cardBounds = await versionOneCard.boundingBox();
  if (!boardBounds || !cardBounds) throw new Error("The canvas frame is not rendered.");
  await page.mouse.move(boardBounds.x + 10, boardBounds.y + 10);
  await page.mouse.wheel(cardBounds.x - boardBounds.x - 40, cardBounds.y - boardBounds.y - 80);
  await versionOneCard.hover({ position: { x: 10, y: 10 } });
  await versionOneCard.locator('[data-test^="canvas-card-focus-"]').click();
  await expect(workspace).toHaveAttribute("data-presentation", "focus");
  await expect.poll(() => new URL(page.url()).searchParams.get("landing-version")).toBe("1");

  await page.reload();
  const restoredHost = page.locator("#nudge-ui-root");
  await expect.poll(() => restoredHost.evaluate((host) => host.shadowRoot !== null)).toBe(true);
  await restoredHost.locator('[data-test="show-inspector"]').click();
  await expect(restoredHost.locator('[data-test="canvas-workspace"]')).toHaveAttribute("data-presentation", "focus");
  await restoredHost.locator('[data-test="canvas-show-canvas"]').click();
  await expect(restoredHost.locator('[data-test="canvas-workspace"]')).toHaveAttribute("data-presentation", "canvas");

  const restoredLabels = await restoredHost.locator('[data-test^="canvas-card-dimensions-"]').allTextContents();
  expect(restoredLabels.sort()).toEqual(["Final", "V1", "V2"]);
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

test("loads the showcase video as it enters the viewport", async ({ page }) => {
  await page.goto("/");

  const app = page.locator("#nudge-ui-root").locator("iframe[data-nudge-ui-canvas-renderer]").first().contentFrame();
  const showcase = app.locator("section.landing-showcase");
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
