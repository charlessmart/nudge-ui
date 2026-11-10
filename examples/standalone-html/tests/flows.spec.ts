import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Frame, type Page } from "@playwright/test";

const temporaryProjectRoot = process.env.NUDGE_UI_STANDALONE_E2E_ROOT ?? "";

const FLOW_FILE = join(temporaryProjectRoot, "nudge/flows/checkout.json");
const STATUS_FILE = join(temporaryProjectRoot, ".nudge/flows-status.json");

/** Frames are identified by what their recipe mocks or seeds, so read each by a state's distinct scenario. */
function stateFrames(page: Page): Frame[] {
  return page.frames().filter((frame) => frame.name().startsWith("nudge-ui-flow-state:"));
}

async function screens(page: Page): Promise<string[]> {
  const texts = await Promise.all(stateFrames(page).map((frame) => frame.locator("#app").innerText().catch(() => "")));
  return texts.map((text) => text.replace(/\s+/g, " ").trim()).sort();
}

/** Flows have their own section above Pages in the panel's Pages view. */
async function openFlowsView(page: Page): Promise<void> {
  await page.locator('[data-test="panel-view-pages"]').click();
  await expect(page.locator('[data-test="navigator-flows"]')).toBeVisible();
}

async function openFlow(page: Page): Promise<void> {
  await page.goto("/");
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible({ timeout: 30_000 });
  await openFlowsView(page);
  await page.locator('[data-test="flows-flow"][data-flow-id="checkout"] [data-test="flows-toggle"]').click();
}

test("a flow shows every state of one URL side by side without touching the app or its data", async ({ page }) => {
  const payRequests: string[] = [];
  page.on("request", (request) => { if (request.url().endsWith("/api/pay")) payRequests.push(request.method()); });
  await openFlow(page);

  await expect.poll(() => screens(page), { timeout: 30_000 }).toEqual([
    // The blocked response has no `message`, so the page falls back to its own error.
    "Checkout 0 items Name Pay Payment failed",
    "Checkout 1 items Name Pay",
    "Checkout 2 items Name Pay Card declined",
    "Get started",
    "Get started",
    "Order placed",
    "Processing",
  ]);

  // Mocks and blocking answered in the browser, so nothing reached the server.
  expect(payRequests).toEqual([]);
  // URLs and the page's real storage are untouched.
  for (const frame of stateFrames(page)) expect(new URL(frame.url()).pathname).toBe("/checkout.html");
  expect(await page.evaluate(() => localStorage.getItem("cart"))).toBeNull();

  await expect(page.locator('[data-test="flow-board-title"]')).toHaveText("Checkout");
  // Each edge is a right-angled arrow carrying its label.
  await expect(page.locator('[data-test="flow-board-edge"]')).toHaveCount(4);
  await expect(page.locator('[data-test="flow-board-label"]')).toHaveText(["Get started", "Pay", "402", "200"]);
  for (const d of await page.locator('[data-test="flow-board-edge"] path').evaluateAll((paths) => paths.map((path) => path.getAttribute("d") ?? ""))) {
    expect(d).toMatch(/^M [\d. -]+( L [\d. -]+)+$/);
  }

  const panel = page.locator('[data-test="flows-panel"]');
  await expect(panel.getByRole("alert")).toContainText('No visible button named "Not on this page"');
  await expect(panel.locator('[data-test="flows-blocked"]')).toHaveText("Blocked 1 write");
  // A mock that never matched is called out, so a wrong pattern is not mistaken for a working one.
  await expect(panel.locator('[data-test="flows-unused"]')).toHaveText("1 mock matched no request");
  await expect(page.locator('[data-test="flow-frame-error"]')).toHaveCount(1);

  // Adding a flow explains that the agent maps it, and offers the prompt.
  await page.locator('[data-test="flows-add"]').click();
  await expect(page.locator('[data-test="flows-add-menu"]')).toContainText("Ask your agent to map screen states as flows.");
  await expect(page.locator('[data-test="flows-add-menu"] [data-test="flows-copy-prompt"]')).toBeVisible();
  await page.keyboard.press("Escape");

  // What the agent reads to repair its recipes.
  await expect.poll(() => {
    try { return (JSON.parse(readFileSync(STATUS_FILE, "utf8")) as unknown[]).length; } catch { return 0; }
  }, { timeout: 15_000 }).toBe(7);
  const status = JSON.parse(readFileSync(STATUS_FILE, "utf8")) as { stateId: string; ok: boolean; failedStep?: number; blocked: string[]; unusedRules?: string[] }[];
  expect(status.find((item) => item.stateId === "processing")?.unusedRules).toEqual(["GET /api/never-called"]);
  expect(status.find((item) => item.stateId === "placed")?.unusedRules).toBeUndefined();
  expect(status.find((item) => item.stateId === "broken")).toMatchObject({ ok: false, failedStep: 0 });
  expect(status.find((item) => item.stateId === "unmocked")?.blocked).toEqual([expect.stringMatching(/^POST .*\/api\/pay$/)]);
  expect(status.find((item) => item.stateId === "placed")).toMatchObject({ ok: true, blocked: [] });
});

test("an edited recipe restarts only its own frame, and a reload reaches every state again", async ({ page }) => {
  await openFlow(page);
  await expect.poll(() => screens(page), { timeout: 30_000 }).toContain("Checkout 2 items Name Pay Card declined");
  const processing = stateFrames(page).find((frame) => frame.name().includes('"hold":true'));
  if (!processing) throw new Error("No processing frame");
  await processing.evaluate(() => { (window as unknown as { marker: boolean }).marker = true; });

  const source = readFileSync(FLOW_FILE, "utf8");
  try {
    writeFileSync(FLOW_FILE, source.replace('"Card declined"', '"Card expired"'));
    await expect.poll(() => screens(page), { timeout: 15_000 }).toContain("Checkout 2 items Name Pay Card expired");
    const kept = stateFrames(page).find((frame) => frame.name().includes('"hold":true'));
    expect(await kept?.evaluate(() => (window as unknown as { marker?: boolean }).marker)).toBe(true);
  } finally {
    writeFileSync(FLOW_FILE, source);
  }
  await expect.poll(() => screens(page), { timeout: 15_000 }).toContain("Checkout 2 items Name Pay Card declined");

  await page.reload();
  await expect.poll(() => screens(page), { timeout: 30_000 }).toEqual(expect.arrayContaining(["Processing", "Order placed", "Checkout 2 items Name Pay Card declined"]));
});

test("a file the schema refuses is explained in the tab", async ({ page }) => {
  const broken = join(temporaryProjectRoot, "nudge/flows/broken.json");
  writeFileSync(broken, JSON.stringify({ version: 2 }));
  try {
    await page.goto("/");
    await openFlowsView(page);
    await expect(page.locator('[data-test="flows-file-error"]')).toContainText("nudge/flows/broken.json");
    await expect(page.locator('[data-test="flows-file-error"]')).toContainText("version");
  } finally {
    rmSync(broken);
  }
});
