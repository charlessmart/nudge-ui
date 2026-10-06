import { expect, test } from "@playwright/test";

test("probe toolbar invocations", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/");
  await expect.poll(() => new URL(page.url()).searchParams.getAll("nudge-ui")).toContain("editor");
  const iframe = page.locator("#nudge-ui-root").locator("iframe[data-nudge-ui-canvas-renderer]").first();
  const app = iframe.contentFrame();
  const toolbars = app.locator(".landing-bento-canvas-toolbar");
  await expect(toolbars).toHaveCount(2);

  const frame = page.frames().find((candidate) => candidate.url() === "http://localhost:5180/")!;
  console.log(JSON.stringify(await frame.evaluate(() => {
    const registry = (globalThis as Record<symbol, unknown>)[Symbol.for("nudge-ui.host-runtime.v1")] as
      { adapters: Map<string, Record<string, unknown>> };
    const adapter = registry.adapters.get("react")!;
    const rootInvocations = adapter.rootInvocations as ((el: HTMLElement) => unknown) | undefined;
    return Array.from(document.querySelectorAll<HTMLElement>(".landing-bento-canvas-toolbar"))
      .map((el) => rootInvocations?.(el) ?? "no method");
  })));

  const sketchToolbar = app.locator(".landing-bento-sketch .landing-bento-canvas-toolbar");
  await sketchToolbar.scrollIntoViewIfNeeded();
  await page.waitForTimeout(1500);
  const box = await sketchToolbar.boundingBox();
  console.log("box", JSON.stringify(box));
  // Click the toolbar padding, not a tool, so the root div is selected.
  await page.mouse.click(box!.x + 2, box!.y + 2);
  await page.waitForTimeout(500);
  console.log("selected", await page.locator("#nudge-ui-root").evaluate((root) =>
    root.shadowRoot?.textContent?.slice(0, 400) ?? root.textContent?.slice(0, 400)));
  await page.keyboard.press("Delete");
  await page.waitForTimeout(800);
  console.log("remaining toolbars", await toolbars.count(), "sketch", await sketchToolbar.count());
  await page.screenshot({ path: "/tmp/probe-delete.png" });
});
