import { test, expect, type FrameLocator, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LEAF_IDS } from "../src/perf-fixture/perfFixture.ts";

const RECORD_MODE = process.env.PERF_RECORD_BASELINE === "1";
const FIXTURE_URL = "/?perf=large";
const POLL_TIMEOUT_MS = 30_000;
const RUNS = 3;

const BUDGET_HOVER_MS = 100;
const BUDGET_CLICK_MS = 100;

const HOVER_LEAF = LEAF_IDS[0]!;
const CLICK_LEAF = LEAF_IDS[1]!;

interface MetricResult {
  median: number;
  runs: number[];
  budget: number;
}

const METRICS: {
  hover?: MetricResult;
  click?: MetricResult;
  hoverMessageCount?: number;
} = {};

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function logRow(key: string, result: MetricResult): void {
  console.log(`perf | ${key.padEnd(14)} | median ${result.median.toFixed(1).padStart(8)}ms | budget ${result.budget}ms | runs [${result.runs.map((r) => r.toFixed(1)).join(", ")}]`);
}

function checkBudget(key: string, result: MetricResult): void {
  if (RECORD_MODE) return;
  expect(
    result.median,
    `${key}: median ${result.median.toFixed(1)}ms exceeds budget ${result.budget}ms (runs: ${result.runs.map((r) => r.toFixed(1)).join(", ")})`,
  ).toBeLessThan(result.budget);
}

function logSummary(): void {
  console.log("perf | === canvas breakdown ===");
  if (METRICS.hover) logRow("canvas hover", METRICS.hover);
  if (METRICS.click) logRow("canvas click", METRICS.click);
  if (METRICS.hoverMessageCount !== undefined) {
    console.log(`perf | hover messages | 50 events -> ${METRICS.hoverMessageCount} postMessages (budget <= 2)`);
  }
}

async function persistBaseline(): Promise<void> {
  if (!RECORD_MODE) return;
  const dir = "test-results";
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "perf-baseline-canvas.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        recordMode: true,
        budgets: {
          hoverMs: BUDGET_HOVER_MS,
          clickMs: BUDGET_CLICK_MS,
          hoverMessageMaxPerFrameBatch: 2,
        },
        hover: METRICS.hover,
        click: METRICS.click,
        hoverMessageCount: METRICS.hoverMessageCount,
      },
      null,
      2,
    ),
  );
  console.log("perf | baseline written to test-results/perf-baseline-canvas.json");
}

async function loadCanvas(page: Page): Promise<FrameLocator> {
  await page.goto(FIXTURE_URL);
  await page.waitForSelector('[data-perf-id="perf-0"]');
  await page.waitForSelector("#design-tool-root");
  await page.locator('[data-test="mode-canvas"]').click();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible();
  await expect(page.locator(".dt-canvas-card__iframe").first()).toBeAttached();
  const frame = page.frameLocator(".dt-canvas-card__iframe").first();
  await expect(frame.locator("body")).toBeVisible({ timeout: 20_000 });
  // A visible frame can still be between document load and renderer bootstrap.
  // Establish readiness with one real hover message before measuring or
  // counting subsequent events.
  await page.evaluate(() => {
    const w = window as unknown as { __canvasRendererReady?: boolean };
    w.__canvasRendererReady = false;
    const onMessage = (event: MessageEvent): void => {
      if (event.data && typeof event.data === "object" && event.data.type === "element-hover") {
        w.__canvasRendererReady = true;
        window.removeEventListener("message", onMessage);
      }
    };
    window.addEventListener("message", onMessage);
  });
  await frame.locator(`[data-perf-id="perf-${HOVER_LEAF}"]`).hover();
  await expect.poll(() => page.evaluate(() => (
    window as unknown as { __canvasRendererReady?: boolean }
  ).__canvasRendererReady ?? false), { timeout: 20_000 }).toBe(true);
  await page.mouse.move(0, 0);
  return frame;
}

/** Install a parent-clock probe that records when the iframe leaf really
 * receives the pointer event, then measure how long the overlay takes to
 * appear in the parent after that moment. Both clocks belong to the parent
 * (the iframe writes `window.parent.performance.now()`), so the elapsed time
 * is a single timeline. */
async function probeThenMeasure(
  page: Page,
  frame: FrameLocator,
  perfId: number,
  eventName: "mouseover" | "click",
  overlayTestId: string,
  pollTimeoutMs: number,
): Promise<number> {
  const leaf = frame.locator(`[data-perf-id="perf-${perfId}"]`);
  await leaf.evaluate((el, { type }) => {
    const parentW = window.parent as Window & { __canvasProbe?: number };
    parentW.__canvasProbe = 0;
    el.addEventListener(type, () => {
      if (!parentW.__canvasProbe) parentW.__canvasProbe = parentW.performance.now();
    }, { capture: true, once: true });
  }, { type: eventName });
  if (eventName === "mouseover") {
    await leaf.hover();
  } else {
    await leaf.click();
  }
  const elapsed = await page.evaluate(({ testId, timeoutMs }) => new Promise<number>((resolve) => {
    const started = performance.now();
    const check = (): void => {
      const root = document.getElementById("design-tool-root")?.shadowRoot;
      const outline = root?.querySelector(`[data-test="${testId}"]`);
      const probe = (window as unknown as { __canvasProbe?: number }).__canvasProbe ?? 0;
      if (outline && probe > 0) {
        resolve(performance.now() - probe);
        return;
      }
      if (performance.now() - started > timeoutMs) {
        resolve(-1);
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }), { testId: overlayTestId, timeoutMs: pollTimeoutMs });
  // Park the pointer outside the iframe so the next run's hover re-enters the
  // leaf and fires a fresh mouseover (a pointer already resting on the element
  // would not fire one).
  await page.mouse.move(0, 0);
  return elapsed;
}

test("perf: canvas hover latency in a large card stays under 100ms", async ({ page }) => {
  test.setTimeout(120_000);
  const frame = await loadCanvas(page);
  const runs: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const ms = await probeThenMeasure(page, frame, HOVER_LEAF, "mouseover", "canvas-hover-outline", POLL_TIMEOUT_MS);
    expect(ms, `canvas hover run ${i + 1} did not complete within ${POLL_TIMEOUT_MS}ms`).toBeGreaterThan(0);
    runs.push(ms);
  }
  const result = { median: median(runs), runs, budget: BUDGET_HOVER_MS };
  METRICS.hover = result;
  logRow("canvas hover", result);
  checkBudget("canvas hover", result);
});

test("perf: canvas click latency in a large card stays under 100ms", async ({ page }) => {
  test.setTimeout(120_000);
  const frame = await loadCanvas(page);
  const runs: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const ms = await probeThenMeasure(page, frame, CLICK_LEAF, "click", "canvas-selected-outline", POLL_TIMEOUT_MS);
    expect(ms, `canvas click run ${i + 1} did not complete within ${POLL_TIMEOUT_MS}ms`).toBeGreaterThan(0);
    runs.push(ms);
  }
  const result = { median: median(runs), runs, budget: BUDGET_CLICK_MS };
  METRICS.click = result;
  logRow("canvas click", result);
  checkBudget("canvas click", result);
});

test("perf: hover messages are frame-throttled, not one-per-event", async ({ page }) => {
  test.setTimeout(60_000);
  const frame = await loadCanvas(page);

  // Install a parent-window counter for element-hover messages only.
  await page.evaluate(() => {
    (window as unknown as { __elementHoverCount?: number }).__elementHoverCount = 0;
    (window as unknown as { __countElementHover?: boolean }).__countElementHover = true;
    window.addEventListener("message", (event) => {
      if (!(window as unknown as { __countElementHover?: boolean }).__countElementHover) return;
      const data = event.data;
      if (data && typeof data === "object" && data.type === "element-hover") {
        (window as unknown as { __elementHoverCount?: number }).__elementHoverCount = ((window as unknown as { __elementHoverCount?: number }).__elementHoverCount ?? 0) + 1;
      }
    });
  });

  // Dispatch 50 synthetic mouseover events on the same leaf synchronously.
  await frame.locator("body").evaluate((_, { perfId }) => {
    const el = document.querySelector(`[data-perf-id="perf-${perfId}"]`);
    if (!el) throw new Error("missing perf leaf");
    for (let i = 0; i < 50; i += 1) {
      el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    }
  }, { perfId: HOVER_LEAF });

  // Give the renderer's frame throttle at least two animation frames to flush,
  // then a generous buffer for cross-frame message delivery.
  await page.evaluate(() => new Promise<void>((resolve) => {
    let frames = 0;
    const tick = (): void => {
      frames += 1;
      if (frames >= 2) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }));
  await page.waitForTimeout(300);

  const count = await page.evaluate(() => (window as unknown as { __elementHoverCount?: number }).__elementHoverCount ?? 0);
  METRICS.hoverMessageCount = count;
  console.log(`perf | hover messages | 50 events -> ${count} postMessages (budget <= 2)`);
  expect(count, `expected the frame throttle to coalesce 50 hover events into at most 2 messages, got ${count}`).toBeLessThanOrEqual(2);
  expect(count, `expected at least one hover message to be delivered, got ${count}`).toBeGreaterThanOrEqual(1);

  logSummary();
  await persistBaseline();
});
