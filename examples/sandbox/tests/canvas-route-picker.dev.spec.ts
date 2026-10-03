import { test, expect } from "@playwright/test";
import { openEditor } from "@nudge-ui/compatibility/playwright";

test("selects discovered pages, adds one grid, and undoes it together", async ({ page }) => {
  // The sandbox uses a hand-written router. Supply the host catalog contract to
  // exercise the picker independently of a particular framework fixture.
  await page.route("**/__nudge_ui__/routes", (route) => route.fulfill({ json: {
    framework: "next", routes: ["/playground", "/conformance", "/components", "/product/[id]"].map((path) => ({ path, source: "app/page.tsx", dynamic: path.includes("[") })),
  } }));
  await openEditor(page, "/playground");
  await page.getByRole("button", { name: "Add pages", exact: true }).click();
  const picker = page.getByRole("region", { name: "Add pages to canvas" });
  await expect(picker.getByLabel("/product/[id]", { exact: false })).toBeDisabled();
  await picker.getByLabel("/conformance", { exact: true }).check();
  await picker.getByLabel("/components", { exact: true }).check();
  await picker.getByRole("button", { name: "Add selected pages as a grid (2)", exact: true }).click();
  const cards = page.locator(".canvas-card");
  await expect(cards).toHaveCount(3);
  await expect(page.locator('[data-test="canvas-workspace"]')).toHaveAttribute("data-presentation", "canvas");
  const sources = await cards.locator("iframe").evaluateAll((frames) => frames.map((frame) => new URL((frame as HTMLIFrameElement).src).pathname));
  expect(sources).toEqual(["/playground", "/conformance", "/components"]);
  const layout = await cards.evaluateAll((frames) => frames.map((frame) => ({ x: parseFloat((frame as HTMLElement).style.left), y: parseFloat((frame as HTMLElement).style.top) })));
  expect(layout[1]!.y).toBe(layout[2]!.y);
  expect(layout[1]!.x).not.toBe(layout[2]!.x);
  await page.locator('[data-test="canvas-board-content"]').evaluate(async (element) => { await Promise.all(element.getAnimations({ subtree: true }).map((animation) => animation.finished.catch(() => undefined))); });
  await page.screenshot({ path: "/private/tmp/nudge-route-picker-grid.png" });
  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  await expect(cards).toHaveCount(1);
  await page.keyboard.press(process.platform === "darwin" ? "Meta+Shift+z" : "Control+Shift+z");
  await expect(cards).toHaveCount(3);
  await page.reload();
  await expect(cards).toHaveCount(3);
});

test("serves the Vite HTML entry catalog and explains client-router discovery", async ({ page }) => {
  await openEditor(page, "/playground");
  await page.getByRole("button", { name: "Add pages", exact: true }).click();
  const picker = page.getByRole("region", { name: "Add pages to canvas" });
  await expect(picker).toContainText("Routes defined inside a client router are not discovered yet.");
  await expect(picker.getByLabel("/", { exact: true })).toBeEnabled();
});
