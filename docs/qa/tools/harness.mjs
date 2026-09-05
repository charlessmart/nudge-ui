// Shared browser-QA harness for nudge-ui sandbox testing.
// Usage: import { runPage, finish } from "./harness.mjs";
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve Playwright from a workspace consumer package instead of a generated
// pnpm store path. This keeps the QA harness portable across checkouts.
const requireFromSandbox = createRequire(
  new URL("../../../examples/sandbox/package.json", import.meta.url),
);
const { chromium } = requireFromSandbox("@playwright/test");

const REPORT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS_DIR = join(REPORT_DIR, "screenshots");

export const state = {
  issues: [], // {sandbox, page, kind, detail, selector, screenshot}
  consoleMessages: [], // {sandbox, page, type, text}
  pageErrors: [], // {sandbox, page, message}
  shots: [],
};

function slug(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "x";
}

export async function launch({ viewport = { width: 1440, height: 900 } } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport });
  return { browser, context };
}

// Attach console/pageerror capture for a page.
export function watchConsole(page, sandbox, pageName) {
  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") {
      state.consoleMessages.push({ sandbox, page: pageName, type, text: msg.text().slice(0, 500) });
    }
  });
  page.on("pageerror", (err) => {
    state.pageErrors.push({ sandbox, page: pageName, message: String(err?.message ?? err).slice(0, 500) });
  });
}

export async function screenshot(page, sandbox, name, opts = {}) {
  const file = join("screenshots", sandbox, `${slug(name)}.png`);
  mkdirSync(join(SHOTS_DIR, sandbox), { recursive: true });
  const abs = join(REPORT_DIR, file);
  await page.screenshot({ path: abs, ...opts });
  state.shots.push(file);
  return file;
}

// Record one issue with a cropped screenshot of the panel (or full page fallback).
export async function recordIssue(page, sandbox, pageName, issue) {
  const entry = { sandbox, page: pageName, ...issue, ts: new Date().toISOString() };
  const base = `${slug(pageName)}__${slug(issue.kind)}__${slug(issue.selector ?? issue.detail).slice(0, 40)}__${state.issues.length}`;
  const file = join("screenshots", sandbox, `${base}.png`);
  mkdirSync(join(SHOTS_DIR, sandbox), { recursive: true });
  try {
    // Prefer a clip of the inspector panel region; fall back to viewport.
    const panel = await findPanelHandle(page);
    if (panel) {
      const box = await panel.boundingBox();
      if (box && box.width > 10 && box.height > 10) {
        await page.screenshot({
          path: join(REPORT_DIR, file),
          clip: {
            x: Math.max(0, box.x - 8),
            y: Math.max(0, box.y - 8),
            width: Math.min(box.width + 16, 1440),
            height: Math.min(box.height + 16, 2000),
          },
        });
      } else {
        await page.screenshot({ path: join(REPORT_DIR, file) });
      }
    } else {
      await page.screenshot({ path: join(REPORT_DIR, file) });
    }
  } catch {
    try { await page.screenshot({ path: join(REPORT_DIR, file) }); } catch { /* page closing */ }
  }
  entry.screenshot = file;
  state.issues.push(entry);
  console.log(`  [ISSUE] ${sandbox}/${pageName} ${issue.kind}: ${issue.detail} ${issue.selector ?? ""}`);
  return entry;
}

// ---- Panel discovery -------------------------------------------------------
// The inspector mounts into an open shadow root on a host element. Find the
// panel root (.panel or [data-test]) inside any shadow root.

async function findPanelHandle(page) {
  // The shadow host is the element whose shadowRoot contains .panel.
  // Playwright css pierces open shadow roots automatically, so try direct first.
  for (const sel of [".panel", "[data-test='tokens-panel']"]) {
    const loc = page.locator(sel).first();
    if (await loc.count()) return loc;
  }
  return null;
}

// Scan executed inside the page: walks every open shadow root, finds the
// inspector panel, and reports layout/label problems.
export const PANEL_SCAN_SNIPPET = () => {
  const BAD_LABEL_RE = /\b(undefined|null|NaN|\[object[^\]]*\])\b/;

  function collectRoots(doc) {
    const roots = [doc];
    const walk = (el) => {
      for (const child of el.querySelectorAll("*")) {
        if (child.shadowRoot) {
          roots.push(child.shadowRoot);
          walk(child.shadowRoot);
        }
      }
    };
    walk(doc);
    return roots;
  }

  const results = { panelFound: false, problems: [], panelRect: null, selectedInfo: null };

  for (const root of collectRoots(document)) {
    const panel = root.querySelector(".panel") ?? root.querySelector("[data-test='tokens-panel']");
    if (!panel) continue;
    results.panelFound = true;
    const panelRect = panel.getBoundingClientRect();
    results.panelRect = { x: panelRect.x, y: panelRect.y, w: panelRect.width, h: panelRect.height };
    if (panelRect.width < 50 || panelRect.height < 50) {
      results.problems.push({ kind: "panel-size", detail: `panel collapsed to ${Math.round(panelRect.width)}x${Math.round(panelRect.height)}`, selector: ".panel" });
    }

    const els = panel.querySelectorAll("*");
    for (const el of els) {
      if (!(el instanceof HTMLElement)) continue;
      const cs = getComputedStyle(el);
      if (cs.display === "none" || cs.visibility === "hidden") continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const text = (el.textContent ?? "").trim();
      const isLeafish = el.children.length === 0 || el.matches("button,input,label,span,div,p,h1,h2,h3,h4,td,th,li,a");

      // 1. Horizontal text overflow (content wider than box, clipped or not)
      if (el.scrollWidth > el.clientWidth + 3 && cs.overflowX !== "visible" && text) {
        results.problems.push({
          kind: "overflow-x",
          detail: `text overflows horizontally: scrollW=${el.scrollWidth} clientW=${el.clientWidth}, text="${text.slice(0, 60)}"`,
          selector: describe(el),
        });
      }
      // 2. Vertical overflow in non-scrollable leaf elements
      if (el.scrollHeight > el.clientHeight + 4 && cs.overflowY === "hidden" && text && el.children.length === 0) {
        results.problems.push({
          kind: "overflow-y-clipped",
          detail: `text clipped vertically: scrollH=${el.scrollHeight} clientH=${el.clientHeight}, text="${text.slice(0, 60)}"`,
          selector: describe(el),
        });
      }
      // 3. Truncation via ellipsis — record what is being cut off
      if (cs.textOverflow === "ellipsis" && el.scrollWidth > el.clientWidth + 2 && text) {
        results.problems.push({
          kind: "truncated-ellipsis",
          detail: `ellipsis truncation active, full text="${text.slice(0, 80)}"`,
          selector: describe(el),
        });
      }
      // 4. Escapes the panel bounds — horizontal only. The panel root is a
      // vertical scroll container (.panel overflow:auto), so content below
      // the fold is expected; sideways escape is the real defect.
      if (
        rect.right > panelRect.right + 3 || rect.left < panelRect.left - 3
      ) {
        // Only report leaf-ish content elements, ignore intentional overlays
        const intentional = el.closest("[data-test='at-rule-tooltip'],[data-test='token-dropdown'],[role='dialog'],[role='listbox'],[data-radix-popper-content-wrapper],.popover,.menu,.popover-listbox");
        if (!intentional && isLeafish && text) {
          results.problems.push({
            kind: "out-of-bounds",
            detail: `element escapes panel horizontally by l=${Math.round(panelRect.left - rect.left)},r=${Math.round(rect.right - panelRect.right)} text="${text.slice(0, 50)}"`,
            selector: describe(el),
          });
        }
      }
      // 5. Zero-size interactive controls (skip 1x1/2x2 visually-hidden pattern)
      if ((el.matches("button,[role='tab'],[role='button'],input,select") ) && rect.width < 8 && rect.height < 8 && (rect.width > 2 || rect.height > 2)) {
        results.problems.push({ kind: "zero-size-control", detail: `interactive element ${Math.round(rect.width)}x${Math.round(rect.height)}`, selector: describe(el) });
      }
      // 6. Bad labels
      if (text && BAD_LABEL_RE.test(text) && text.length < 80) {
        results.problems.push({ kind: "bad-label", detail: `suspicious label text="${text.slice(0, 60)}"`, selector: describe(el) });
      }
      // Empty required labels on icon buttons
      if (el.matches("button") && !text && !el.getAttribute("aria-label") && !el.querySelector("[aria-label],title")) {
        results.problems.push({ kind: "unlabelled-button", detail: "button with no text or aria-label", selector: describe(el) });
      }
    }

    // Selected element info for context
    const crumb = panel.querySelector("[data-test='crumb']");
    if (crumb) results.selectedInfo = crumb.textContent?.slice(0, 100) ?? null;
    // Inventory for the report: tokens + controls present
    results.inventory = {
      tokenGroups: panel.querySelectorAll("[data-test='token-group']").length,
      tokenChips: panel.querySelectorAll("[data-test='token-chip']").length,
      tokenFields: panel.querySelectorAll("[data-test='token-field']").length,
      typographyFields: panel.querySelectorAll("[data-test='typography-field']").length,
      colorPickers: panel.querySelectorAll("[data-test='color-picker']").length,
      changesRows: root.querySelectorAll("[data-test='change-row']").length,
      emptyState: !!root.querySelector("[data-test='empty-state']"),
      tokensEmpty: !!root.querySelector("[data-test='tokens-empty']"),
    };
    break; // only the root that actually contains the panel
  }

  function describe(el) {
    const tag = el.tagName.toLowerCase();
    const dt = el.getAttribute?.("data-test");
    const cls = typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    return `${tag}${dt ? `[data-test=${dt}]` : ""}${cls}`;
  }

  return results;
};

// Dedup helper applied at the end (same kind+selector on same page = one issue).
export function dedupe() {
  const seen = new Map();
  for (const i of state.issues) {
    const key = `${i.sandbox}|${i.page}|${i.kind}|${i.selector ?? ""}|${(i.detail ?? "").slice(0, 60)}`;
    if (!seen.has(key)) seen.set(key, i);
  }
  state.issues = [...seen.values()];
}

export function finish(sandboxName = "all") {
  dedupe();
  const out = {
    generatedAt: new Date().toISOString(),
    sandbox: sandboxName,
    issueCount: state.issues.length,
    consoleErrorCount: state.consoleMessages.filter((m) => m.type === "error").length,
    consoleWarnCount: state.consoleMessages.filter((m) => m.type === "warning").length,
    pageErrorCount: state.pageErrors.length,
    issues: state.issues,
    consoleMessages: state.consoleMessages,
    pageErrors: state.pageErrors,
  };
  writeFileSync(join(REPORT_DIR, `issues-${sandboxName}.json`), JSON.stringify(out, null, 2));
  console.log(`\nDone. ${out.issueCount} issues, ${out.consoleErrorCount} console errors, ${out.pageErrorCount} page errors.`);
  console.log(`Raw JSON: docs/qa/issues-${sandboxName}.json`);
  return out;
}

// Click a host-page element and wait for the inspector to reflect selection.
export async function clickAndSettle(page, handle) {
  try {
    await handle.click({ timeout: 1500, trial: false });
  } catch {
    return false;
  }
  await page.waitForTimeout(250);
  return true;
}
