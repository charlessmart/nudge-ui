import { test, expect, type Page } from "@playwright/test";
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
  console.log("perf | === same-document hover breakdown ===");
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

async function loadFixture(page: Page): Promise<void> {
  await page.goto(FIXTURE_URL);
  await page.waitForSelector('[data-perf-id="perf-0"]');
  await page.waitForFunction(() => document.querySelectorAll("style[data-perf-style]").length === 4);
  await page.waitForSelector("#nudge-ui-root");
}

/** Outline matches when the shadow-root `.hover-outline` rect is within a
 * pixel of the leaf's bounding rect. */
async function hoverMs(page: Page, perfId: number): Promise<number> {
  const leaf = page.locator(`[data-perf-id="perf-${perfId}"]`);
  await leaf.evaluate((el) => {
    const w = window as unknown as { __hoverProbe?: number };
    w.__hoverProbe = 0;
    el.addEventListener("mouseover", () => {
      const w2 = window as unknown as { __hoverProbe?: number };
      if (!w2.__hoverProbe) w2.__hoverProbe = performance.now();
    }, { capture: true, once: true });
  });
  await leaf.hover();
  const elapsed = await page.evaluate(({ id, timeoutMs }) => new Promise<number>((resolve) => {
    const started = performance.now();
    const check = (): void => {
      const probe = (window as unknown as { __hoverProbe?: number }).__hoverProbe ?? 0;
      const leaf = document.querySelector(`[data-perf-id="perf-${id}"]`);
      const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
      const outline = sr?.querySelector(".hover-outline") ?? null;
      if (probe > 0 && leaf && outline) {
        const leafRect = leaf.getBoundingClientRect();
        const outlineRect = outline.getBoundingClientRect();
        const matches = Math.abs(outlineRect.left - leafRect.left) <= 1
          && Math.abs(outlineRect.top - leafRect.top) <= 1
          && Math.abs(outlineRect.width - leafRect.width) <= 1
          && Math.abs(outlineRect.height - leafRect.height) <= 1;
        if (matches) {
          resolve(performance.now() - probe);
          return;
        }
      }
      if (performance.now() - started > timeoutMs) {
        resolve(-1);
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }), { id: perfId, timeoutMs: POLL_TIMEOUT_MS });
  await page.mouse.move(0, 0);
  // Let the hover-clear settle so the next run measures a fresh reveal.
  await page.waitForTimeout(50);
  return elapsed;
}

/** Pointer already rests on `fromId` (outline matches it); move to `toId`
 * and measure until the outline matches `toId`. */
async function hoverSwitchMs(page: Page, fromId: number, toId: number): Promise<number> {
  const from = page.locator(`[data-perf-id="perf-${fromId}"]`);
  const to = page.locator(`[data-perf-id="perf-${toId}"]`);
  await from.hover();
  await page.waitForFunction(() => {
    const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
    return sr?.querySelector(".hover-outline") !== null;
  }, undefined, { timeout: POLL_TIMEOUT_MS });
  await to.evaluate((el) => {
    const w = window as unknown as { __hoverProbe?: number };
    w.__hoverProbe = 0;
    el.addEventListener("mouseover", () => {
      const w2 = window as unknown as { __hoverProbe?: number };
      if (!w2.__hoverProbe) w2.__hoverProbe = performance.now();
    }, { capture: true, once: true });
  });
  await to.hover();
  const elapsed = await page.evaluate(({ id, timeoutMs }) => new Promise<number>((resolve) => {
    const started = performance.now();
    const check = (): void => {
      const probe = (window as unknown as { __hoverProbe?: number }).__hoverProbe ?? 0;
      const leaf = document.querySelector(`[data-perf-id="perf-${id}"]`);
      const sr = document.getElementById("nudge-ui-root")?.shadowRoot;
      const outline = sr?.querySelector(".hover-outline") ?? null;
      if (probe > 0 && leaf && outline) {
        const leafRect = leaf.getBoundingClientRect();
        const outlineRect = outline.getBoundingClientRect();
        const matches = Math.abs(outlineRect.left - leafRect.left) <= 1
          && Math.abs(outlineRect.top - leafRect.top) <= 1
          && Math.abs(outlineRect.width - leafRect.width) <= 1
          && Math.abs(outlineRect.height - leafRect.height) <= 1;
        if (matches) {
          resolve(performance.now() - probe);
          return;
        }
      }
      if (performance.now() - started > timeoutMs) {
        resolve(-1);
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }), { id: toId, timeoutMs: POLL_TIMEOUT_MS });
  await page.mouse.move(0, 0);
  await page.waitForTimeout(50);
  return elapsed;
}

test("perf: same-document hover outline reveal stays under budget", async ({ page }) => {
  test.setTimeout(120_000);
  await loadFixture(page);
  const runs: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const ms = await hoverMs(page, HOVER_LEAF);
    expect(ms, `hover reveal run ${i + 1} did not complete within ${POLL_TIMEOUT_MS}ms`).toBeGreaterThan(0);
    runs.push(ms);
  }
  const result = { median: median(runs), runs, budget: BUDGET_HOVER_MS };
  METRICS.hover = result;
  logRow("hover reveal", result);
  checkBudget("hover reveal", result);
});

test("perf: same-document hover outline switch stays under budget", async ({ page }) => {
  test.setTimeout(120_000);
  await loadFixture(page);
  const runs: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const ms = await hoverSwitchMs(page, SWITCH_FROM, SWITCH_TO);
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
