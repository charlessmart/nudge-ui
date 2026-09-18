import { expect, test, type FrameLocator, type Locator, type Page } from "@playwright/test";
import { ensureEditorOwnership } from "./editor.ts";

const FIXTURE_URL = "/playground";
const RUNS = 5;
const POLL_TIMEOUT_MS = 5_000;
const DRAG_GUIDE_BUDGET_MS = 100;

interface DragProbeState {
  startX: number;
  startY: number;
  thresholdAt: number;
}

interface MetricResult {
  p50: number;
  p95: number;
  max: number;
  runs: number[];
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = (sorted.length - 1) * fraction;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sorted[lower]!;
  const weight = index - lower;
  return sorted[lower]! + (sorted[upper]! - sorted[lower]!) * weight;
}

function summarize(runs: number[]): MetricResult {
  return {
    p50: percentile(runs, 0.5),
    p95: percentile(runs, 0.95),
    max: Math.max(...runs),
    runs,
  };
}

function logMetric(label: string, metric: MetricResult): void {
  console.log(
    `perf | ${label.padEnd(25)} | p50 ${metric.p50.toFixed(1).padStart(7)}ms | `
    + `p95 ${metric.p95.toFixed(1).padStart(7)}ms | max ${metric.max.toFixed(1).padStart(7)}ms | `
    + `runs [${metric.runs.map((run) => run.toFixed(1)).join(", ")}]`,
  );
}

function checkBudget(label: string, metric: MetricResult): void {
  expect(
    metric.p95,
    `${label}: p95 ${metric.p95.toFixed(1)}ms exceeds ${DRAG_GUIDE_BUDGET_MS}ms (runs: ${metric.runs.map((run) => run.toFixed(1)).join(", ")})`,
  ).toBeLessThan(DRAG_GUIDE_BUDGET_MS);
}

async function installParentProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const scope = window as unknown as {
      __nudgeDragProbe?: DragProbeState;
      __nudgeDragProbeInstalled?: boolean;
    };
    if (scope.__nudgeDragProbeInstalled) return;
    scope.__nudgeDragProbeInstalled = true;
    window.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      scope.__nudgeDragProbe = { startX: event.clientX, startY: event.clientY, thresholdAt: 0 };
    }, true);
    // Window capture runs before the inspector's document capture handler.
    // This timestamp therefore starts at the first event that can activate a
    // drag, rather than after the handler has done its work.
    window.addEventListener("mousemove", (event) => {
      const probe = scope.__nudgeDragProbe;
      if (!probe || probe.thresholdAt > 0 || event.buttons !== 1) return;
      if (Math.hypot(event.clientX - probe.startX, event.clientY - probe.startY) < 6) return;
      probe.thresholdAt = performance.now();
    }, true);
  });
}

async function resetParentProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const scope = window as unknown as { __nudgeDragProbe?: DragProbeState };
    scope.__nudgeDragProbe = undefined;
  });
}

async function installFrameProbe(page: Page, frame: FrameLocator): Promise<void> {
  await installParentProbe(page);
  await frame.locator("body").evaluate(() => {
    const scope = window as unknown as { __nudgeDragProbeInstalled?: boolean };
    if (scope.__nudgeDragProbeInstalled) return;
    scope.__nudgeDragProbeInstalled = true;
    const parentScope = window.parent as unknown as {
      __nudgeDragProbe?: DragProbeState;
    };
    window.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      parentScope.__nudgeDragProbe = { startX: event.clientX, startY: event.clientY, thresholdAt: 0 };
    }, true);
    // The renderer listens on the iframe document. Capture on the iframe
    // window records the threshold before that handler posts to the parent.
    window.addEventListener("mousemove", (event) => {
      const probe = parentScope.__nudgeDragProbe;
      if (!probe || probe.thresholdAt > 0 || event.buttons !== 1) return;
      if (Math.hypot(event.clientX - probe.startX, event.clientY - probe.startY) < 6) return;
      probe.thresholdAt = window.parent.performance.now();
    }, true);
  });
}

async function waitForVisibleGuide(page: Page, selector: string): Promise<number> {
  return page.evaluate(({ selector, timeoutMs }) => new Promise<number>((resolve) => {
    const started = performance.now();
    const check = (): void => {
      const probe = (window as unknown as { __nudgeDragProbe?: DragProbeState }).__nudgeDragProbe;
      const guide = document.getElementById("nudge-ui-root")?.shadowRoot?.querySelector(selector);
      const style = guide instanceof HTMLElement ? getComputedStyle(guide) : null;
      const rect = guide?.getBoundingClientRect();
      const visible = Boolean(
        guide
        && rect
        && rect.width > 0
        && rect.height > 0
        && style?.display !== "none"
        && style?.visibility !== "hidden",
      );
      if (probe && probe.thresholdAt > 0 && visible) {
        resolve(performance.now() - probe.thresholdAt);
        return;
      }
      if (performance.now() - started > timeoutMs) {
        resolve(-1);
        return;
      }
      requestAnimationFrame(check);
    };
    requestAnimationFrame(check);
  }), { selector, timeoutMs: POLL_TIMEOUT_MS });
}

async function dragToGuide(
  page: Page,
  source: Locator,
  destination: Locator,
  guideSelector: string,
): Promise<number> {
  await source.scrollIntoViewIfNeeded();
  await destination.scrollIntoViewIfNeeded();
  const [sourceBox, destinationBox] = await Promise.all([source.boundingBox(), destination.boundingBox()]);
  if (!sourceBox || !destinationBox) throw new Error("Expected visible drag targets");
  const isFlexRow = await destination.evaluate((element) => {
    const parent = element.parentElement;
    if (!parent) return false;
    const style = getComputedStyle(parent);
    return (style.display === "flex" || style.display === "inline-flex") && style.flexDirection.startsWith("row");
  });
  await page.mouse.move(0, 0);
  await resetParentProbe(page);
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  const guideVisible = waitForVisibleGuide(page, guideSelector);
  await page.mouse.move(
    isFlexRow ? destinationBox.x + 4 : destinationBox.x + destinationBox.width / 2,
    isFlexRow ? destinationBox.y + destinationBox.height / 2 : destinationBox.y + 4,
  );
  const elapsed = await guideVisible;
  await page.mouse.up();
  return elapsed;
}

async function loadEditingSurface(page: Page): Promise<{ frame: FrameLocator; source: Locator; destination: Locator }> {
  await page.goto(FIXTURE_URL);
  await ensureEditorOwnership(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('[data-test="canvas-workspace"]')).toBeVisible({ timeout: 20_000 });
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await expect(frame.locator("body")).toBeVisible({ timeout: 20_000 });
  const source = frame.locator('[data-test="flex-child-a"]');
  const destination = frame.locator('[data-test="flex-child-c"]');
  await expect(source).toBeVisible();
  await expect(destination).toBeVisible();
  await installFrameProbe(page, frame);
  return { frame, source, destination };
}

async function loadStructuralEditingSurface(page: Page): Promise<{ frame: FrameLocator; source: Locator; destination: Locator }> {
  await page.goto(FIXTURE_URL);
  await ensureEditorOwnership(page);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const frame = page.frameLocator(".canvas-card__iframe").first();
  await expect(frame.locator("body")).toBeVisible({ timeout: 20_000 });
  const source = frame.locator('[data-test="structural-move-target"]');
  const destination = frame.locator('[data-test="structural-anchor"]');
  await expect(source).toBeVisible();
  await expect(destination).toBeVisible();
  await installFrameProbe(page, frame);
  return { frame, source, destination };
}

test("perf: editing-surface drag threshold to first visible insertion guide", async ({ page }) => {
  test.setTimeout(120_000);
  const runs: number[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    const { source, destination } = await loadEditingSurface(page);
    const elapsed = await dragToGuide(page, source, destination, '[data-test="canvas-dom-drop-line"]');
    expect(elapsed, `editing-surface drag run ${run + 1} did not produce a visible guide`).toBeGreaterThan(0);
    runs.push(elapsed);
  }
  const metric = summarize(runs);
  logMetric("editing-surface drag guide", metric);
  checkBudget("editing-surface drag guide", metric);
});

test("perf: editing-surface cross-container drag threshold to first visible insertion guide", async ({ page }) => {
  test.setTimeout(120_000);
  const runs: number[] = [];
  for (let run = 0; run < RUNS; run += 1) {
    const { source, destination } = await loadStructuralEditingSurface(page);
    const elapsed = await dragToGuide(page, source, destination, '[data-test="canvas-dom-drop-line"]');
    expect(elapsed, `editing-surface cross-container drag run ${run + 1} did not produce a visible guide`).toBeGreaterThan(0);
    runs.push(elapsed);
  }
  const metric = summarize(runs);
  logMetric("editing-surface cross-container", metric);
  checkBudget("editing-surface cross-container", metric);
});
