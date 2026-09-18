import { test, expect, type FrameLocator, type Page } from "@playwright/test";
import { ensureEditorOwnership } from "@nudge-ui/compatibility/playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LEAF_IDS } from "../src/perf-fixture/perfFixture.ts";

const RECORD_MODE = process.env.PERF_RECORD_BASELINE === "1";
const FIXTURE_URL = "/?perf=large";
const POLL_TIMEOUT_MS = 30_000;
const RUNS = 5;

const BUDGET_HOVER_MS = 100;
const BUDGET_HOVER_SWITCH_MS = 100;

const HOVER_LEAF = LEAF_IDS[4]!;
const SWITCH_FROM = LEAF_IDS[5]!;
const SWITCH_TO = LEAF_IDS[6]!;

interface MetricResult {
  median: number;
  runs: number[];
  budget: number;
}

interface HoverMetrics {
  hover?: MetricResult;
  hoverSwitch?: MetricResult;
}

const METRICS: HoverMetrics = {};

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
  console.log("perf | === iframe hover breakdown ===");
  if (METRICS.hover) logRow("hover reveal", METRICS.hover);
  if (METRICS.hoverSwitch) logRow("hover switch", METRICS.hoverSwitch);
}

async function persistBaseline(): Promise<void> {
  if (!RECORD_MODE) return;
  const dir = "test-results";
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "perf-baseline-hover.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        recordMode: true,
        budgets: {
          hoverMs: BUDGET_HOVER_MS,
          hoverSwitchMs: BUDGET_HOVER_SWITCH_MS,
        },
        hover: METRICS.hover,
        hoverSwitch: METRICS.hoverSwitch,
      },
      null,
      2,
    ),
  );
  console.log("perf | baseline written to test-results/perf-baseline-hover.json");
}

async function loadFixture(page: Page): Promise<FrameLocator> {
  await page.goto(FIXTURE_URL);
  await ensureEditorOwnership(page);
  const frame = page.frameLocator('.canvas-card__iframe').first();
  await expect(frame.locator('[data-perf-id="perf-0"]')).toBeVisible();
  await expect.poll(() => frame.locator('style[data-perf-style]').count()).toBe(4);
  return frame;
}

async function measureHover(page: Page, leaf: import("@playwright/test").Locator): Promise<number> {
  await leaf.scrollIntoViewIfNeeded();
  // Scrolling can move the destination underneath the pointer and dispatch
  // mouseover before the one-shot probe is armed. Park outside the iframe so
  // the measured hover always delivers a fresh event.
  await page.mouse.move(0, 0);
  const target = await leaf.boundingBox();
  if (!target) return -1;
  await leaf.evaluate((element) => {
    const parent = window.parent as Window & { __hoverProbe?: number };
    parent.__hoverProbe = 0;
    element.addEventListener("mouseover", () => {
      if (!parent.__hoverProbe) parent.__hoverProbe = parent.performance.now();
    }, { capture: true, once: true });
  });
  await page.evaluate(({ target, timeoutMs }) => {
    const scope = window as unknown as {
      __hoverProbe?: number;
      __hoverResult?: { done: boolean; elapsed: number };
    };
    scope.__hoverResult = { done: false, elapsed: -1 };
    const started = performance.now();
    const check = (): void => {
      const probe = scope.__hoverProbe ?? 0;
      const outline = document.getElementById("nudge-ui-root")?.shadowRoot?.querySelector('[data-test="canvas-hover-outline"]');
      const rect = outline?.getBoundingClientRect();
      if (probe > 0 && rect
        && Math.abs(rect.left - target.x) <= 1
        && Math.abs(rect.top - target.y) <= 1
        && Math.abs(rect.width - target.width) <= 1
        && Math.abs(rect.height - target.height) <= 1) {
        scope.__hoverResult = { done: true, elapsed: performance.now() - probe };
        return;
      }
      if (performance.now() - started > timeoutMs) {
        scope.__hoverResult = { done: true, elapsed: -1 };
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }, { target, timeoutMs: POLL_TIMEOUT_MS });
  await leaf.hover();
  await page.waitForFunction(() => (
    window as unknown as { __hoverResult?: { done: boolean } }
  ).__hoverResult?.done === true, undefined, { timeout: POLL_TIMEOUT_MS + 1_000 });
  const elapsed = await page.evaluate(() => (
    window as unknown as { __hoverResult?: { elapsed: number } }
  ).__hoverResult?.elapsed ?? -1);
  await page.mouse.move(0, 0);
  await page.waitForTimeout(50);
  return elapsed;
}

async function hoverMs(page: Page, frame: FrameLocator, perfId: number): Promise<number> {
  return measureHover(page, frame.locator(`[data-perf-id="perf-${perfId}"]`));
}

async function hoverSwitchMs(page: Page, frame: FrameLocator, fromId: number, toId: number): Promise<number> {
  await frame.locator(`[data-perf-id="perf-${fromId}"]`).hover();
  await expect(page.locator('[data-test="canvas-hover-outline"]')).toBeVisible({ timeout: POLL_TIMEOUT_MS });
  return measureHover(page, frame.locator(`[data-perf-id="perf-${toId}"]`));
}

test("perf: iframe hover outline reveal stays under budget", async ({ page }) => {
  test.setTimeout(120_000);
  const frame = await loadFixture(page);
  const runs: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const ms = await hoverMs(page, frame, HOVER_LEAF);
    expect(ms, `hover reveal run ${i + 1} did not complete within ${POLL_TIMEOUT_MS}ms`).toBeGreaterThan(0);
    runs.push(ms);
  }
  const result = { median: median(runs), runs, budget: BUDGET_HOVER_MS };
  METRICS.hover = result;
  logRow("hover reveal", result);
  checkBudget("hover reveal", result);
});

test("perf: iframe hover outline switch stays under budget", async ({ page }) => {
  test.setTimeout(120_000);
  const frame = await loadFixture(page);
  const runs: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const ms = await hoverSwitchMs(page, frame, SWITCH_FROM, SWITCH_TO);
    expect(ms, `hover switch run ${i + 1} did not complete within ${POLL_TIMEOUT_MS}ms`).toBeGreaterThan(0);
    runs.push(ms);
  }
  const result = { median: median(runs), runs, budget: BUDGET_HOVER_SWITCH_MS };
  METRICS.hoverSwitch = result;
  logRow("hover switch", result);
  checkBudget("hover switch", result);

  logSummary();
  await persistBaseline();
});
