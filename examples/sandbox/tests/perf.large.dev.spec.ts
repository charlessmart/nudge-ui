import { test, expect, type Page } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LEAF_IDS, expectedStyleFor } from "../src/perf-fixture/perfFixture.ts";

const RECORD_MODE = process.env.PERF_RECORD_BASELINE === "1";
const FIXTURE_URL = "/?perf=large";
const POLL_TIMEOUT_MS = 30_000;
const RUNS = 3;

const BUDGET_COLD_REVEAL_MS = 100;
const BUDGET_WARM_REVEAL_MS = 30;
const BUDGET_COMMIT_MS = 50;
const BUDGET_GROWTH_RATIO = 2;

const COLD_LEAF = LEAF_IDS[0]!;
const WARM_LEAF = LEAF_IDS[1]!;
const WARM_OTHER = LEAF_IDS[2]!;
const COMMIT_LEAF = LEAF_IDS[3]!;

interface Probe {
  clickAt: number;
  done: boolean;
  ms: number;
}

interface MetricResult {
  median: number;
  runs: number[];
  budget: number;
}

interface GrowthResult {
  first: MetricResult;
  last: MetricResult;
  ratio: number;
}

interface LargeMetrics {
  coldReveal?: MetricResult;
  warmReveal?: MetricResult;
  commit?: MetricResult;
  growth?: GrowthResult;
}

const METRICS: LargeMetrics = {};

const COMMIT_STEPS: readonly { property: string; hostProperty: string; value: string }[] = [
  { property: "background-color", hostProperty: "background-color", value: "#ef4444" },
  { property: "color", hostProperty: "color", value: "#3b82f6" },
  { property: "font-size", hostProperty: "font-size", value: "21px" },
  { property: "line-height", hostProperty: "line-height", value: "140%" },
  { property: "letter-spacing", hostProperty: "letter-spacing", value: "0.06em" },
  { property: "font-family", hostProperty: "font-family", value: "Georgia, serif" },
  { property: "padding-vertical", hostProperty: "padding-top", value: "13px" },
  { property: "padding-horizontal", hostProperty: "padding-left", value: "17px" },
  { property: "margin-vertical", hostProperty: "margin-top", value: "11px" },
  { property: "margin-horizontal", hostProperty: "margin-left", value: "7px" },
  { property: "border-radius", hostProperty: "border-radius", value: "14px" },
  { property: "border-width", hostProperty: "border-width", value: "3px" },
  { property: "border-color", hostProperty: "border-color", value: "#a855f7" },
  { property: "box-shadow", hostProperty: "box-shadow", value: "0 4px 12px rgba(0, 0, 0, 0.25)" },
  { property: "padding-top", hostProperty: "padding-top", value: "23px" },
  { property: "padding-left", hostProperty: "padding-left", value: "29px" },
  { property: "margin-top", hostProperty: "margin-top", value: "5px" },
  { property: "margin-left", hostProperty: "margin-left", value: "9px" },
  { property: "border-top-width", hostProperty: "border-top-width", value: "4px" },
  { property: "border-top-color", hostProperty: "border-top-color", value: "#f97316" },
];

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
  console.log("perf | === breakdown ===");
  if (METRICS.coldReveal) logRow("cold reveal", METRICS.coldReveal);
  if (METRICS.warmReveal) logRow("warm reveal", METRICS.warmReveal);
  if (METRICS.commit) logRow("edit commit", METRICS.commit);
  if (METRICS.growth) {
    const { first, last, ratio } = METRICS.growth;
    logRow("growth commit #1", { ...first, budget: 0 });
    logRow("growth commit #20", { ...last, budget: 0 });
    console.log(`perf | growth ratio   | median ${last.median.toFixed(1)}ms / ${first.median.toFixed(1)}ms = ${ratio.toFixed(2)}x | budget ${BUDGET_GROWTH_RATIO}x`);
  }
}

async function persistBaseline(): Promise<void> {
  if (!RECORD_MODE) return;
  const dir = "test-results";
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "perf-baseline.json"),
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        recordMode: true,
        budgets: {
          coldRevealMs: BUDGET_COLD_REVEAL_MS,
          warmRevealMs: BUDGET_WARM_REVEAL_MS,
          commitMs: BUDGET_COMMIT_MS,
          growthRatio: BUDGET_GROWTH_RATIO,
        },
        coldReveal: METRICS.coldReveal,
        warmReveal: METRICS.warmReveal,
        commit: METRICS.commit,
        growth: METRICS.growth,
      },
      null,
      2,
    ),
  );
  console.log(`perf | baseline written to test-results/perf-baseline.json`);
}

let fixtureStorageResetInstalled = false;

async function loadFixture(page: Page): Promise<void> {
  // Clear storage in an init script on the *next* document so a previous
  // page's beforeunload autosave cannot repopulate localStorage after we
  // intended a clean fixture load.
  if (!fixtureStorageResetInstalled) {
    await page.addInitScript(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        // ignore
      }
    });
    fixtureStorageResetInstalled = true;
  }
  await page.goto(FIXTURE_URL);
  await page.waitForSelector('[data-perf-id="perf-0"]');
  await page.waitForFunction(() => document.querySelectorAll("style[data-perf-style]").length === 4);
  await page.waitForSelector("#design-tool-root");
}

function revealCandidates(perfId: number): string[] {
  const hex = expectedStyleFor(perfId).backgroundColor;
  const n = parseInt(hex.slice(1), 16);
  const rgb = `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
  return [hex, hex.toUpperCase(), rgb, rgb.replaceAll(" ", "")];
}

async function revealMs(page: Page, perfId: number): Promise<number> {
  const candidates = revealCandidates(perfId);
  await page.evaluate(() => {
    const w = window as unknown as { __perfProbe?: Probe };
    w.__perfProbe = { clickAt: 0, done: false, ms: 0 };
    document.addEventListener("click", () => {
      const p = w.__perfProbe;
      if (p && p.clickAt === 0) p.clickAt = performance.now();
    }, { capture: true, once: true });
  });
  await page.click(`[data-perf-id="perf-${perfId}"]`);
  const result = await page.evaluate(({ cands, pollTimeoutMs }) => {
    return new Promise<number>((resolve) => {
      const w = window as unknown as { __perfProbe?: Probe };
      const probe = w.__perfProbe;
      if (!probe) {
        resolve(-1);
        return;
      }
      const start = probe.clickAt > 0 ? probe.clickAt : performance.now();
      const check = (): void => {
        const sr = document.getElementById("design-tool-root")?.shadowRoot;
        const rows = Array.from(sr?.querySelectorAll('[data-test="token-field"]') ?? []);
        const hit = rows.some((row) => {
          if (row.getAttribute("data-property") !== "background-color") return false;
          const raw = row.querySelector('[data-test="raw-input"]');
          return raw !== null && cands.includes((raw.getAttribute("value") ?? "").trim());
        });
        if (hit) {
          probe.done = true;
          probe.ms = performance.now() - start;
          resolve(probe.ms);
          return;
        }
        if (performance.now() - start > pollTimeoutMs) {
          const sr = document.getElementById("design-tool-root")?.shadowRoot;
          const rows = Array.from(sr?.querySelectorAll('[data-test="token-field"]') ?? []).map((row) => {
            const raw = row.querySelector('[data-test="raw-input"]');
            return `${row.getAttribute("data-property")}=${raw?.getAttribute("value") ?? ""}`;
          });
          console.log(`perf | reveal timeout; candidates=${JSON.stringify(cands)}; rows=${JSON.stringify(rows.slice(0, 20))}`);
          resolve(-1);
          return;
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }, { cands: candidates, pollTimeoutMs: POLL_TIMEOUT_MS });
  return result;
}

async function commitMs(page: Page, perfId: number, property: string, hostProperty: string, value: string): Promise<number> {
  const pre = await page.evaluate(({ id, prop, hostProp }) => {
    const el = document.querySelector(`[data-perf-id="perf-${id}"]`);
    const sr = document.getElementById("design-tool-root")?.shadowRoot;
    const raw = sr?.querySelector(`[data-test="token-field"][data-property="${prop}"] [data-test="raw-input"]`);
    if (!(el instanceof HTMLElement)) return { host: "", panel: "", expectedHost: "" };
    return {
      host: getComputedStyle(el).getPropertyValue(hostProp).trim(),
      panel: (raw?.getAttribute("value") ?? "").trim(),
      expectedHost: "",
    };
  }, { id: perfId, prop: property, hostProp: hostProperty });
  const expectedHost = await page.evaluate(({ id, hostProp, value }) => {
    const el = document.querySelector(`[data-perf-id="perf-${id}"]`);
    if (!(el instanceof HTMLElement)) return "";
    // Compute the browser-normalized target value on a same-class clone. This
    // catches a commit that merely changes the panel while leaving the host
    // element unchanged, including values such as percentages and colors.
    const probe = el.cloneNode(false) as HTMLElement;
    probe.removeAttribute("data-perf-id");
    probe.style.setProperty(hostProp, value);
    document.body.appendChild(probe);
    const result = getComputedStyle(probe).getPropertyValue(hostProp).trim();
    probe.remove();
    return result;
  }, { id: perfId, hostProp: hostProperty, value });
  const result = await page.evaluate(({ id, prop, hostProp, value, preHost, prePanel, expectedHost: targetHost, pollTimeoutMs }) => {
    return new Promise<number>((resolve) => {
      const sr = document.getElementById("design-tool-root")?.shadowRoot;
      const raw = sr?.querySelector(
        `[data-test="token-field"][data-property="${prop}"] [data-test="raw-input"]`,
      ) as HTMLInputElement | null;
      if (!raw) {
        resolve(-1);
        return;
      }
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
      raw.focus();
      setter.call(raw, value);
      raw.dispatchEvent(new Event("input", { bubbles: true }));
      raw.dispatchEvent(new Event("change", { bubbles: true }));
      const start = performance.now();
      const w = window as unknown as { __perfProbe?: Probe };
      w.__perfProbe = { clickAt: start, done: false, ms: 0 };
      raw.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
      const check = (): void => {
        const el = document.querySelector(`[data-perf-id="perf-${id}"]`);
        const sr2 = document.getElementById("design-tool-root")?.shadowRoot;
        const raw2 = sr2?.querySelector(
          `[data-test="token-field"][data-property="${prop}"] [data-test="raw-input"]`,
        );
        const host = el ? getComputedStyle(el).getPropertyValue(hostProp).trim() : "";
        const panel = (raw2?.getAttribute("value") ?? "").trim();
        if (host !== "" && host !== preHost && host === targetHost && panel === value && panel !== prePanel) {
          const probe = w.__perfProbe;
          if (probe) {
            probe.done = true;
            probe.ms = performance.now() - start;
          }
          resolve(probe?.ms ?? performance.now() - start);
          return;
        }
        if (performance.now() - start > pollTimeoutMs) {
          resolve(-1);
          return;
        }
        requestAnimationFrame(check);
      };
      requestAnimationFrame(check);
    });
  }, { id: perfId, prop: property, hostProp: hostProperty, value, preHost: pre.host, prePanel: pre.panel, expectedHost, pollTimeoutMs: POLL_TIMEOUT_MS });
  return result;
}

async function expandSpacingSides(page: Page, group: "padding" | "margin"): Promise<void> {
  const section = page.locator(`[data-test="spacing-${group}"]`);
  const add = section.locator('[data-test="add-value"]');
  if (await add.count()) await add.click();
  const toggle = section.locator('[data-test="individual-sides"]');
  if ((await toggle.count()) > 0) {
    await toggle.click();
    await expect(section).toHaveAttribute("data-expanded", "true", { timeout: 10_000 });
  }
}

async function expandBorderSides(page: Page): Promise<void> {
  const toggle = page.locator('[data-test="border-expand"]');
  if ((await toggle.count()) > 0) {
    await toggle.click();
    await page.waitForSelector('[data-test="token-field"][data-property="border-top-width"]', { timeout: 10_000 });
  }
}

test("perf: cold selection reveal stays under 100ms", async ({ page }) => {
  const runs: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    await loadFixture(page);
    const ms = await revealMs(page, COLD_LEAF);
    expect(ms, `cold reveal run ${i + 1} did not complete within ${POLL_TIMEOUT_MS}ms`).toBeGreaterThan(0);
    runs.push(ms);
  }
  const result = { median: median(runs), runs, budget: BUDGET_COLD_REVEAL_MS };
  METRICS.coldReveal = result;
  logRow("cold reveal", result);
  checkBudget("cold reveal", result);
});

test("perf: warm repeat selection reveal stays under 30ms", async ({ page }) => {
  await loadFixture(page);
  const runs: number[] = [];
  for (let i = 0; i < RUNS; i += 1) {
    const warmup = await revealMs(page, WARM_OTHER);
    expect(warmup, `warm reveal warmup run ${i + 1} did not complete within ${POLL_TIMEOUT_MS}ms`).toBeGreaterThan(0);
    const ms = await revealMs(page, WARM_LEAF);
    expect(ms, `warm reveal run ${i + 1} did not complete within ${POLL_TIMEOUT_MS}ms`).toBeGreaterThan(0);
    runs.push(ms);
  }
  const result = { median: median(runs), runs, budget: BUDGET_WARM_REVEAL_MS };
  METRICS.warmReveal = result;
  logRow("warm reveal", result);
  checkBudget("warm reveal", result);
});

test("perf: edit commit stays under 50ms", async ({ page }) => {
  const values = ["#ef4444", "#22c55e", "#a855f7"];
  const runs: number[] = [];
  for (let i = 0; i < values.length; i += 1) {
    await loadFixture(page);
    const reveal = await revealMs(page, COMMIT_LEAF);
    expect(reveal, `commit run ${i + 1} selection did not complete`).toBeGreaterThan(0);
    const ms = await commitMs(page, COMMIT_LEAF, "background-color", "background-color", values[i]!);
    expect(ms, `edit commit run ${i + 1} did not complete within ${POLL_TIMEOUT_MS}ms`).toBeGreaterThan(0);
    runs.push(ms);
  }
  const result = { median: median(runs), runs, budget: BUDGET_COMMIT_MS };
  METRICS.commit = result;
  logRow("edit commit", result);
  checkBudget("edit commit", result);
});

test("perf: session growth stays sublinear (commit #20 <= 2x commit #1)", async ({ page }) => {
  test.setTimeout(600_000);
  const firsts: number[] = [];
  const lasts: number[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    await loadFixture(page);
    const reveal = await revealMs(page, COMMIT_LEAF);
    expect(reveal, `growth run ${run + 1} selection did not complete`).toBeGreaterThan(0);
    const durations: number[] = [];
    for (let step = 0; step < COMMIT_STEPS.length; step += 1) {
      if (step === 14) {
        await expandSpacingSides(page, "padding");
        await expandSpacingSides(page, "margin");
      }
      if (step === 18) await expandBorderSides(page);
      const { property, hostProperty, value } = COMMIT_STEPS[step]!;
      const ms = await commitMs(page, COMMIT_LEAF, property, hostProperty, value);
      expect(ms, `commit #${step + 1} (${property}) run ${run + 1} did not complete within ${POLL_TIMEOUT_MS}ms`).toBeGreaterThan(0);
      durations.push(ms);
    }
    firsts.push(durations[0]!);
    lasts.push(durations[19]!);
    console.log(`perf | growth run ${run + 1}: ${durations.map((d) => d.toFixed(0)).join(" ")}`);
  }
  const first = { median: median(firsts), runs: firsts, budget: 0 };
  const last = { median: median(lasts), runs: lasts, budget: 0 };
  const ratio = last.median / first.median;
  METRICS.growth = { first, last, ratio };
  logRow("growth commit #1", first);
  logRow("growth commit #20", last);
  console.log(`perf | growth ratio   | median ${last.median.toFixed(1)}ms / ${first.median.toFixed(1)}ms = ${ratio.toFixed(2)}x | budget ${BUDGET_GROWTH_RATIO}x`);
  if (!RECORD_MODE) {
    expect(
      ratio,
      `session growth: commit #20 median ${last.median.toFixed(1)}ms is ${ratio.toFixed(1)}x commit #1 median ${first.median.toFixed(1)}ms; budget is ${BUDGET_GROWTH_RATIO}x`,
    ).toBeLessThanOrEqual(BUDGET_GROWTH_RATIO);
  }
  logSummary();
  await persistBaseline();
});
