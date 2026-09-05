// Per-page battery: preview click-through + panel scans, tokens tab, canvas mode.
// Used by each sandbox runner script.
import {
  watchConsole, screenshot, recordIssue, PANEL_SCAN_SNIPPET, state,
} from "./harness.mjs";

const MAX_ELEMENTS = 30;
const MAX_ISSUES_PER_SCAN = 10;

// Tag visible, interesting host elements with data-qa-idx and return count.
// Leaf-only: an element is tagged only if it contains no other interesting
// element, so containers like #root never swallow their subtree.
const COLLECT_SNIPPET = () => {
  const interesting = "button,a,h1,h2,h3,h4,p,li,td,th,label,input,select,textarea,img,span,div,section,article,header,footer,nav";
  const els = [...document.querySelectorAll(interesting)];
  let i = 0;
  for (const el of els) {
    if (i >= 60) break;
    if (el.querySelector(interesting)) continue; // not a leaf in the interesting set
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (r.top > innerHeight || r.bottom < 0) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || cs.pointerEvents === "none") continue;
    const hasText = (el.textContent ?? "").trim().length > 0 || el.tagName === "IMG" || el.matches("input,select,textarea");
    if (!hasText) continue;
    if (el.closest("[data-qa-idx]")) continue;
    el.setAttribute("data-qa-idx", String(i++));
  }
  return i;
};

async function scanAndRecord(page, sandbox, name, phase, selectedDesc) {
  let scan;
  try {
    scan = await page.evaluate(PANEL_SCAN_SNIPPET);
  } catch (e) {
    await recordIssue(page, sandbox, name, { kind: "scan-failed", detail: `evaluate failed: ${String(e).slice(0, 120)}`, phase });
    return;
  }
  if (!scan.panelFound) {
    await recordIssue(page, sandbox, name, { kind: "panel-missing", detail: `inspector panel not found (${phase})`, selector: selectedDesc });
    return;
  }
  const seen = new Set();
  let recorded = 0;
  for (const p of scan.problems) {
    const key = `${p.kind}|${p.selector}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (recorded >= MAX_ISSUES_PER_SCAN) break;
    recorded++;
    await recordIssue(page, sandbox, name, {
      kind: p.kind,
      detail: p.detail,
      selector: p.selector,
      phase,
      selected: selectedDesc ?? scan.selectedInfo,
    });
  }
}

export async function runPage({ context, sandbox, url, name, discoverPages = false, viewport = { width: 1440, height: 900 } }) {
  const page = await context.newPage();
  watchConsole(page, sandbox, name);
  const discovered = new Set();

  try {
    await page.goto(url, { waitUntil: "load", timeout: 60_000 });
  } catch (e) {
    await recordIssue(page, sandbox, name, { kind: "load-failed", detail: String(e).slice(0, 200) });
    await page.close().catch(() => {});
    return { discovered };
  }
  await page.waitForTimeout(1500); // inspector hydration
  await screenshot(page, sandbox, `${name}-preview-baseline`);

  // ---- Phase 1: panel present on load ----
  await scanAndRecord(page, sandbox, name, "initial-load", null);

  // ---- Phase 2: click through host elements ----
  let count = 0;
  try {
    count = await page.evaluate(COLLECT_SNIPPET);
  } catch { /* page may restrict */ }
  const limit = Math.min(count, MAX_ELEMENTS);
  console.log(`  [${sandbox}/${name}] clicking ${limit} elements`);
  for (let i = 0; i < limit; i++) {
    const el = page.locator(`[data-qa-idx="${i}"]`);
    try {
      if (!(await el.isVisible())) continue;
      const desc = await el.evaluate((n) => `${n.tagName.toLowerCase()}${n.getAttribute("data-test") ? `[${n.getAttribute("data-test")}]` : ""} "${(n.textContent ?? "").trim().slice(0, 40)}"`).catch(() => `idx-${i}`);
      const href = await el.getAttribute("href").catch(() => null);
      const before = page.url();
      await el.click({ timeout: 2000, force: true }).catch(() => {});
      await page.waitForTimeout(280);
      const after = page.url();
      if (after !== before) {
        if (discoverPages && href) discovered.add(new URL(href, before).pathname);
        await page.goBack({ waitUntil: "load", timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(600);
        continue;
      }
      await scanAndRecord(page, sandbox, name, "click-through", desc);
    } catch { /* element vanished; continue */ }
  }
  // cleanup tags
  await page.evaluate(() => document.querySelectorAll("[data-qa-idx]").forEach((n) => n.removeAttribute("data-qa-idx"))).catch(() => {});

  // ---- Phase 3: tokens tab ----
  const tokensTab = page.locator("[data-test='tokens-tab']");
  if (await tokensTab.count()) {
    await tokensTab.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(600);
    await screenshot(page, sandbox, `${name}-tokens-tab`);
    await scanAndRecord(page, sandbox, name, "tokens-tab", null);
    const search = page.locator("[data-test='token-search']");
    if (await search.count()) {
      await search.fill("col").catch(() => {});
      await page.waitForTimeout(500);
      await scanAndRecord(page, sandbox, name, "tokens-search", null);
      await search.fill("").catch(() => {});
    }
    await page.locator("[data-test='inspect-tab']").click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(300);
  } else {
    await recordIssue(page, sandbox, name, { kind: "tokens-tab-missing", detail: "tokens-tab control not found" });
  }

  // ---- Phase 4: canvas mode ----
  // (collapse/expand test runs last so it cannot poison later phases)
  const canvasBtn = page.locator("[data-test='mode-canvas']");
  const canvasWorkspace = page.locator("[data-test='canvas-workspace']");
  const workspaceAtLoad = (await canvasWorkspace.count()) > 0;
  if ((await canvasBtn.count()) > 0 || workspaceAtLoad) {
    // The panel action enters Canvas from inspect mode and is hidden while
    // Canvas is active. Canvas mode persists across navigations, so we may
    // already be in it.
    const activeAtLoad = workspaceAtLoad;
    if (!activeAtLoad) {
      await canvasBtn.click({ timeout: 3000 }).catch(() => {});
    }
    // Cards render synchronously with mode; iframes load async.
    let cardsReady = false;
    for (let w = 0; w < 10; w++) {
      if ((await page.locator(".canvas-card").count()) > 0) { cardsReady = true; break; }
      await page.waitForTimeout(400);
    }
    const ws = page.locator("[data-test='canvas-workspace']");
    if (!cardsReady || !(await ws.count())) {
      await recordIssue(page, sandbox, name, { kind: "canvas-not-rendered", detail: `canvas workspace/cards missing after enabling canvas mode (cardsReady=${cardsReady}, wasActiveAtLoad=${activeAtLoad})` });
    } else {
      await screenshot(page, sandbox, `${name}-canvas-initial`);
      const cardEl = page.locator(".canvas-card").first();
      const beforeDrag = await cardEl.boundingBox();
      if (!beforeDrag) {
        await recordIssue(page, sandbox, name, { kind: "canvas-no-cards", detail: "no canvas cards present in canvas mode" });
      } else {
        // 5a. click a real element inside the renderer iframe
        const frameEl = page.locator("[data-test^='canvas-card-iframe-']").first();
        if (await frameEl.count()) {
          try {
            const elFrame = await frameEl.elementHandle().then((h) => h.contentFrame());
            if (elFrame) {
              const target = elFrame.locator("h1,h2,h3,p,button,a,img").first();
              if (await target.count()) {
                await target.click({ timeout: 5000, force: true }).catch(() => {});
                await page.waitForTimeout(500);
              } else {
                await elFrame.locator("body").click({ position: { x: 60, y: 60 }, timeout: 4000 }).catch(() => {});
                await page.waitForTimeout(500);
              }
              const outline = page.locator("[data-test='canvas-selected-outline']");
              const outlineVisible = (await outline.count()) && (await outline.first().isVisible().catch(() => false));
              if (!outlineVisible) {
                await recordIssue(page, sandbox, name, { kind: "canvas-click-no-select", detail: "clicking element inside canvas card did not produce selection outline", phase: "canvas" });
              }
              await screenshot(page, sandbox, `${name}-canvas-after-click`);
            }
          } catch (e) {
            await recordIssue(page, sandbox, name, { kind: "canvas-iframe-error", detail: String(e).slice(0, 160), phase: "canvas" });
          }
        }
        // 5b. drag card by toolbar non-button area (buttons opt out of drag)
        const grabPoint = await cardEl.evaluate((card) => {
          const tb = card.querySelector(".canvas-card__toolbar")?.getBoundingClientRect();
          if (!tb) return null;
          const buttons = [...card.querySelectorAll(".canvas-card__toolbar button")].map((b) => b.getBoundingClientRect());
          const candidates = [
            [tb.left + 3, tb.top + 3], [tb.left + 3, tb.bottom - 3],
            [tb.right - 3, tb.top + 3], [tb.right - 3, tb.bottom - 3],
            [tb.left + 3, tb.top + tb.height / 2], [tb.right - 3, tb.top + tb.height / 2],
          ];
          for (const [x, y] of candidates) {
            if (!buttons.some((b) => x >= b.left - 1 && x <= b.right + 1 && y >= b.top - 1 && y <= b.bottom + 1)) return { x, y };
          }
          return null;
        }).catch(() => null);
        if (grabPoint) {
          await page.mouse.move(grabPoint.x, grabPoint.y);
          await page.mouse.down();
          await page.mouse.move(grabPoint.x + 120, grabPoint.y + 60, { steps: 12 });
          await page.mouse.up();
          await page.waitForTimeout(500);
          const afterDrag = await cardEl.boundingBox().catch(() => null);
          if (!afterDrag || !beforeDrag || Math.hypot(afterDrag.x - beforeDrag.x, afterDrag.y - beforeDrag.y) < 40) {
            await recordIssue(page, sandbox, name, { kind: "canvas-drag-no-move", detail: `card did not move after toolbar drag (moved ${afterDrag && beforeDrag ? Math.round(Math.hypot(afterDrag.x - beforeDrag.x, afterDrag.y - beforeDrag.y)) : "?"}px)`, phase: "canvas" });
          }
          await screenshot(page, sandbox, `${name}-canvas-after-drag`);
        } else {
          await recordIssue(page, sandbox, name, { kind: "canvas-drag-skipped", severity: "info", detail: "no non-button grab point on card toolbar found", phase: "canvas" });
        }
        // 5c. resize card via handle
        const resize = cardEl.locator("[data-test^='canvas-card-resize-']").first();
        if (await resize.count()) {
          const rb = await resize.boundingBox().catch(() => null);
          const sizeBefore = await cardEl.boundingBox();
          if (rb && rb.width > 0) {
            await page.mouse.move(rb.x + rb.width / 2, rb.y + rb.height / 2);
            await page.mouse.down();
            await page.mouse.move(rb.x + rb.width / 2 + 90, rb.y + rb.height / 2 + 70, { steps: 10 });
            await page.mouse.up();
            await page.waitForTimeout(500);
            const sizeAfter = await cardEl.boundingBox().catch(() => null);
            if (!sizeAfter || !sizeBefore || sizeAfter.width - sizeBefore.width < 40) {
              await recordIssue(page, sandbox, name, { kind: "canvas-resize-no-change", detail: `card resize handle drag did not resize card (${sizeBefore?.width} -> ${sizeAfter?.width})`, phase: "canvas" });
            }
            await screenshot(page, sandbox, `${name}-canvas-after-resize`);
          } else {
            await recordIssue(page, sandbox, name, { kind: "canvas-resize-handle-invisible", detail: `resize handle has no hit area (box=${JSON.stringify(rb)})`, phase: "canvas" });
          }
        }
        // 5d. duplicate card = create new canvas page
        const dup = page.locator("[data-test^='canvas-card-duplicate-']").first();
        if (await dup.count()) {
          const cardsBefore = await page.locator(".canvas-card").count();
          await dup.click({ timeout: 3000, force: true }).catch(() => {});
          await page.waitForTimeout(1500);
          const cardsAfter = await page.locator(".canvas-card").count();
          if (cardsAfter <= cardsBefore) {
            await recordIssue(page, sandbox, name, { kind: "canvas-duplicate-failed", detail: `duplicate card: ${cardsBefore} -> ${cardsAfter}`, phase: "canvas" });
          } else {
            await screenshot(page, sandbox, `${name}-canvas-after-duplicate`);
          }
        }
        // 5e. viewport resize while in canvas
        await page.setViewportSize({ width: 1100, height: 700 });
        await page.waitForTimeout(600);
        await screenshot(page, sandbox, `${name}-canvas-viewport-1100`);
        await page.setViewportSize({ width: 1800, height: 1000 });
        await page.waitForTimeout(600);
        await screenshot(page, sandbox, `${name}-canvas-viewport-1800`);
        const wsStill = await page.locator("[data-test='canvas-workspace']").isVisible().catch(() => false);
        if (!wsStill) {
          await recordIssue(page, sandbox, name, { kind: "canvas-vanished-on-resize", detail: "canvas workspace not visible after viewport resize", phase: "canvas" });
        }
        await page.setViewportSize(viewport);
        await page.waitForTimeout(400);
      }
      // 5f. return to preview through the first card's Page view action.
      const pageView = page.locator("[data-test^='canvas-card-preview-']").first();
      if (await pageView.count()) {
        await pageView.click({ timeout: 3000 }).catch(() => {});
      } else {
        await recordIssue(page, sandbox, name, { kind: "preview-exit-failed", detail: "no Page view action was available in Canvas", phase: "canvas-exit" });
      }
      await page.waitForTimeout(900);
      const exited = (await page.locator("[data-test='canvas-workspace']").count()) === 0;
      const panelBack = await page.evaluate(PANEL_SCAN_SNIPPET);
      if (!exited && panelBack.panelFound) {
        await recordIssue(page, sandbox, name, { kind: "preview-exit-failed", detail: "workspace still mounted after clicking Page view", phase: "canvas-exit" });
      }
      if (!panelBack.panelFound) {
        await recordIssue(page, sandbox, name, { kind: "preview-restore-failed", detail: "inspector panel missing after returning from canvas to preview", phase: "canvas-exit" });
      }
      const hostVisible = await page.evaluate(() => !!document.querySelector("body *:not(script):not(style)"));
      if (!hostVisible) {
        await recordIssue(page, sandbox, name, { kind: "host-content-missing", detail: "host page content missing after returning from canvas", phase: "canvas-exit" });
      }
      await screenshot(page, sandbox, `${name}-back-to-preview`);
    }
  } else {
    // Distinguish "capability intentionally off" from a broken/locked workspace.
    const locked = await page.locator("[data-test='takeover-here']").count();
    const workspaceElsewhere = await page.evaluate(() => {
      const roots = [document];
      const walk = (d) => { for (const c of d.querySelectorAll("*")) if (c.shadowRoot) { roots.push(c.shadowRoot); walk(c.shadowRoot); } };
      walk(document);
      for (const r of roots) if (r.querySelector?.("[data-test='locked-workspace'],[data-test='takeover-here']")) return true;
      return false;
    }).catch(() => false);
    await recordIssue(page, sandbox, name, {
      kind: "canvas-toggle-missing",
      severity: "info",
      detail: locked || workspaceElsewhere
        ? "canvas toggle not found AND workspace is locked (another tab holds the write lease)"
        : "canvas mode toggle not found — host adapter does not enable canvas capability (see host bootstrap capabilities.canvas)",
    });
  }

  // ---- Phase 5 (last): panel collapse/expand + restore ----
  const collapse = page.locator("[data-test='collapse-inspector']");
  if (await collapse.count()) {
    await collapse.click({ timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(400);
    await screenshot(page, sandbox, `${name}-panel-collapsed`);
    const show = page.locator("[data-test='show-inspector']");
    if (await show.count()) {
      await show.click({ timeout: 3000 }).catch(() => {});
      await page.waitForTimeout(400);
      const back = await page.evaluate(PANEL_SCAN_SNIPPET);
      if (!back.panelFound) {
        await recordIssue(page, sandbox, name, { kind: "panel-restore-failed", detail: "panel did not reappear after Show inspector click", phase: "collapse-restore" });
      }
    } else {
      await recordIssue(page, sandbox, name, { kind: "show-inspector-missing", detail: "no show-inspector affordance after collapsing panel", phase: "collapse-restore" });
    }
  }

  // runBeforeUnload mirrors a real tab close: fires the inspector's
  // beforeunload -> releaseLease so the next page isn't locked out.
  await page.close({ runBeforeUnload: true }).catch(() => {});
  return { discovered };
}
