# Browser QA Report — Inspector Panel & Canvas across Sandbox Hosts

**Branch:** `feat/astro-host-adapter` · **Date:** 2025-08-24 · **Runner:** Playwright 1.61.1 (headless Chromium), harness in `docs/qa/tools/`

> Provenance note: this report was first produced against the same branch with all evidence stored in an untracked `report/` directory, which was subsequently wiped (almost certainly a `git clean` of untracked files). The report text below is the original; the full battery was then re-run from `docs/qa/tools/run-all.sh` to regenerate every screenshot and JSON log into `docs/qa/`. The re-run reproduced all findings identically (same truncation set on the same routes, same canvas behaviours), which is itself a stability signal.

## Executive summary

All four sandbox hosts were driven end-to-end in a real browser: every visible page element was clicked, the inspector panel was scanned after each selection for overflow / truncation / bad labels, the Tokens tab was exercised (including search), and — where the host enables it — canvas mode was tested for board render, element selection, card drag, card resize, card duplication, viewport resizes, and return to preview.

| Sandbox | Pages | Elements clicked | Real defects | Console errors |
|---|---|---|---|---|
| **astro** (`sandbox-astro`, :4322) | `/`, `/about` | 12 + 6 | 0 | 0 |
| **raw-html** (`standalone-html` CLI, :4180) | `/` | 6 | **2** (F1) | 0 |
| **next** (`sandbox-next`, :5177) | `/`, `/second`, `/pricing` | 5 + 3 + 2 | 0 | 0 |
| **react** (`sandbox`, :5173) | 11 routes | 16–30 per route | **2** (F1, F2) + 1 minor (F3) | 1 transient |

**Zero page errors across every run on every host.** React logged a single transient resource-load failure (`net::ERR_CONNECTION_REFUSED`, one request on one page) across the whole regenerated run; every other console message is Chromium's benign warning about the canvas card iframe's `allow-scripts + allow-same-origin` sandbox combination.

Headline findings:

1. **F1 — Token names are truncated with no recovery path** (all hosts). Token names longer than the fixed chip/row width are cut with ellipsis and there is no tooltip, wrap, or expansion. The distinguishing *suffix* of the name is exactly what gets cut (`--color-accent-subtle` → `--color-accent…`), so similarly-prefixed tokens are indistinguishable — in a tool whose job is identifying tokens.
2. **F2 — Canvas card drag affordance is effectively unusable** (react sandbox). Card dragging is wired to the card toolbar, but the toolbar is fully covered by buttons; the only drag surfaces are two **4 px gaps** between buttons. A drag started on any button is intentionally ignored (`CanvasCard.tsx`: `if (target.closest("button")) return`).
3. **F3 — Card resize hit target collapses at zoom-out** (react sandbox, minor). The resize handle is a fixed 16 px element that scales with board zoom. Unlike the toolbar (which inverse-scales via `toolbarScale` to stay hittable), at ~0.75 zoom the handle is ~12 px and automated drags on it reliably fail; at the zoom levels a multi-card board reaches, it becomes effectively unhittable.

Also noted (info, by design on this branch): **canvas mode is only enabled on the React host** — astro, next, and standalone all hardcode `capabilities.canvas: false`, so canvas could only be exercised on the react sandbox.

---

## Method

### Battery (per page)

1. **Load & baseline** — navigate, wait for inspector hydration, full-page screenshot.
2. **Panel presence scan** — locate the inspector panel (mounted in an open shadow root on `#design-tool-root`), verify it renders.
3. **Click-through** — tag up to 30 visible leaf elements (`button, a, h1–h4, p, li, td, th, label, input, select, textarea, img, span, div, section…`), click each, then scan the panel:
   - `overflow-x` — text wider than its box while clipped (`scrollWidth > clientWidth`, `overflow-x` not visible)
   - `overflow-y-clipped` — vertically clipped text in leaf elements
   - `truncated-ellipsis` — active `text-overflow: ellipsis` cutting content
   - `out-of-bounds` — content escaping the panel **horizontally** (vertical is expected: `.dt-panel` is the scroll container, `InspectorShell.css:3–9`)
   - `zero-size-control` — interactive elements under 8 px (1–2 px visually-hidden inputs exempted)
   - `bad-label` — labels containing `undefined` / `null` / `NaN` / `[object…]`
   - `unlabelled-button` — buttons with no text, `aria-label`, or inner label
4. **Tokens tab** — switch, screenshot, scan, exercise token search (`"col"`), scan again.
5. **Canvas mode** (where enabled) — enter via the panel toggle (handles both fresh entry and persisted canvas state), verify board + cards, click an element inside a card iframe and require the selection outline, drag the card by its toolbar, resize via the handle, duplicate the card (creates a new canvas page), resize the viewport (1100×700 → 1800×1000) mid-canvas, exit back to preview and verify panel + host content restore.
6. **Collapse/expand panel** — last, so it cannot poison other phases; restore via the `Show inspector` affordance and re-verify.

Console messages (`error`/`warning`) and page errors were captured on every page throughout.

### Harness reliability work

The first harness draft produced ~130 findings; forensic re-verification showed most were harness artifacts, and each was root-caused and fixed before the final runs:

- **Vertical "out-of-bounds" flood** — panel body content below the fold is by design (`.dt-panel { overflow: auto }`); check reduced to horizontal escape only.
- **Zombie write-lease** — `page.close()` skips `beforeunload` by default, so the inspector's lease (`workspaceLease.ts`, 15 s expiry) stayed fresh and locked the next tab out (locked-notice UI). Fixed with `page.close({ runBeforeUnload: true })`, mirroring a real tab close.
- **Element collector swallowed pages** — tagging `div#root` first skipped entire subtrees ("clicking 1 elements"); fixed to leaf-only tagging (React went from 1 to 16–30 elements/page).
- **Wrong canvas selectors** — `[data-test^='canvas-card-']` also matches card *inner* elements (first match was a 100×32 button, so drags "failed"); card root is `.dt-canvas-card`. Exit-from-canvas uses the same `mode-canvas` toggle (label swaps to "Exit canvas"); the `mode-preview` test id belongs to a different, panel-absent component.
- **Canvas mode persistence** — canvas mode persists across navigations (by design, `sessionStore.ts:969–973`); the battery now reads `data-active` before entering.

### Forensic verification of canvas failures

Automated canvas steps that failed were each re-tested manually against a fresh board before being classified:

| Automated result | Forensic re-test | Verdict |
|---|---|---|
| card drag: no movement | drag via 4 px toolbar gap: **moved 170 px** | **F2** — works, but grab target is 2×4 px |
| resize: 573.75 → 573.75 | fresh board: **960 → 1080**; 7-card board: **960 → 1020** | **F3** — works at zoom 1; fails when handle shrinks with zoom |
| duplicate: 7 → 7 | fresh board: **1 → 2** | harness artifact (hit-target occlusion at zoom) — not a defect |
| iframe click: no outline | click on identity element: **outline visible** | harness artifact (clicked non-identity elements) — not a defect |

---

## Findings

### F1 · Token names truncated with no recovery path — all hosts

**Severity: Medium (core-UX) · Affects: react, raw-html (same component on every host)**

Both token-label surfaces clip with ellipsis and expose no tooltip, wrap, or expansion:

| Surface | Element | Available width | Cut example |
|---|---|---|---|
| Tokens tab rows | `code.dt-token-row__name` | 108 px | `--color-accent-subtle` → `--color-accent…` |
| Inspector color chip | `span.dt-token-chip__label` | **53 px** | `--color-border-subtle` → `--color-border…`, `--color-surface-raised` → `--color-surface…` |

- Root cause: `TokensPanel.css:48` (.dt-token-row__name) and `TokenChip.css:70` (.dt-token-chip__label) — `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` with no `title` attribute on the elements (`TokensPanel.tsx:112`, `TokenChip.tsx:36`).
- Observed on: raw-html (`--color-accent-alt`, `--color-surface-alt`) and **every react page** (`--color-accent-subtle` ×10 routes, `--color-border-subtle`, `--color-surface-raised`, `--color-border`).
- Impact: in a 320 px panel, any token name past ~16 monospace characters loses its distinguishing tail. `--color-accent-subtle` vs `--color-accent-alt` vs `--color-accent` are unreadable as distinct tokens.
- Suggested directions: `title` tooltip as a floor; wrap to two lines or shrink font before truncating; widen the name column in the tokens grid (`grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr)`).

Evidence: `docs/qa/screenshots/raw-html/index-tokens-tab.png`, `docs/qa/screenshots/react/index__truncated-ellipsis__code.dt-token-row__name__*.png` and matching `overflow-x` shots; 30 occurrences logged in `docs/qa/issues-raw-html.json` / `docs/qa/issues-react.json`.

### F2 · Canvas card drag affordance is two 4 px slivers — react sandbox

**Severity: Medium (usability) · Affects: canvas (react host only)**

- Card dragging is implemented on the card toolbar's `pointerdown` (`canvas/CanvasCard.tsx:154–191`), which explicitly bails on buttons: `if (target.closest("button")) return;`.
- The toolbar contains only buttons: "Page view" (100.4 px) + Duplicate (32 px) + Reload (32 px) fill the toolbar edge-to-edge (measured: toolbar 172.4 px wide, buttons span the full width; gaps between buttons: **4 px and 4 px**).
- Verified: a drag starting inside a 4 px gap works perfectly (card moved 170 px). A drag starting anywhere else on the toolbar — i.e. where a user will actually try — silently does nothing.
- Impact: the primary canvas gesture (arranging cards) is discoverable only by luck; users will conclude dragging is broken.
- Suggested directions: make the whole toolbar a drag surface with `stopPropagation` on button clicks instead of ignoring button pointerdowns; or add a dedicated grip area; or support dragging the card frame with a modifier key.

### F3 · Resize handle hit target collapses with board zoom — react sandbox

**Severity: Low-Medium · Affects: canvas**

- The resize handle (`canvas-card-resize-*`, `CanvasCard.tsx:312–322`) is a fixed 16 px element inside the scaled board, so its on-screen size is `16 × camera.zoom`.
- The card toolbar solves this exact problem with `toolbarScale` (inverse-zoom scaling, `toolbarScale.ts`; measured `matrix(1.5, …)`) so buttons stay hittable at any zoom. The resize handle got no such treatment.
- Measured behaviour: resize works at zoom 1 (960→1080, and 960→1020 with 7 cards on board). Automated drags at zoom 0.75 (handle ≈ 12 px) failed 8/8 times across routes; at the zoom a 10+ card board reaches (~0.2), the handle is ~3 px — practically unhittable.
- Suggested direction: apply the same inverse-zoom scaling (or a min hit area) to the resize handle as the toolbar already has.

### Info · Canvas capability is react-host-only on this branch

`packages/astro/src/bootstrap.ts:61` hardcodes `canvas: false` (same for next and standalone hosts). The panel on those hosts simply omits the canvas toggle — no broken UI, clean gating. Flagging so it's a conscious decision and not forgotten when the astro host adapter work lands. Until then, canvas QA coverage on astro/next/raw-html is structurally impossible.

### Non-findings worth recording

- **No `bad-label`, `zero-size-control`, or `unlabelled-button` hits** anywhere in the final runs — token labels, component-prop rows, and icon buttons are all cleanly labelled.
- **Panel collapse/expand, tokens search, viewport resizes, and canvas↔preview round-trips** all pass on every host that offers them.
- **Write-lease locked-notice** correctly appears when a second tab attempts to control the same workspace, and clears via "Take over here". (Observed during harness debugging; by design per ADR-0035.)

---

## Per-sandbox detail

### astro (`examples/sandbox-astro`, astro dev :4322)

- Pages: `/` (12 elements), `/about` (6 elements). Multi-page instrumentation works; panel + tokens tab (5 tokens: 3 color, 1 spacing, 1 radius) render cleanly on both pages.
- Panel scans across initial load, 18 click-selections, tokens tab, tokens search: **no overflow, truncation, or label issues**.
- Canvas: toggle absent (capability off — see Info).
- Console: clean.

### raw-html (`examples/standalone-html` via standalone CLI :4180)

- Page: `/` (6 elements). Runtime-inserted element ("Created later") is tracked by the inspector correctly.
- Panel scans: **F1 hits** — color chip label `--color-accent` clipped (83 px needed / 53 px available); tokens tab rows `--color-accent-alt`, `--color-surface-alt` ellipsized (122/108 px). Tokens tab shows 4 color + 1 spacing token; search works.
- Canvas: capability off. Console: clean.

### next (`examples/sandbox-next`, next dev :5177)

- Pages: `/` (5), `/second` (3), `/pricing` (2). Panel renders on all routes; "client island" badge, HeroCard, and nav all select cleanly with correct token attribution (`--color-accent` chip on Tracer bullet heading).
- Panel scans across all routes + tokens tabs: **no issues**. Canvas: capability off. Console: clean.

### react (`examples/sandbox`, vite :5173) — 11 routes

| Route | Elements | Panel issues |
|---|---|---|
| `/` | 30 | F1 (chip + tokens tab) |
| `/playground` | 27 | F1 |
| `/components` | 25 | F1 |
| `/component-props` | 16 | F1 |
| `/conformance` | 8 | F1 |
| `/examples` | 6 | F1 |
| `/examples/raw-css` | 23 | F1 |
| `/border-conformance` | 28 | F1 |
| `/color-conformance` | 12 | F1 |
| `/typography-conformance` | 11 | F1 |
| `/spacing-conformance` | 23 | F1 |

Canvas (react is the only canvas-enabled host): board renders per route; cards persist and accumulate across routes by design; element click→selection outline verified; card drag works via toolbar gap (F2); card resize works at zoom 1 but not when zoomed out (F3); duplicate creates a new card (verified 1→2); viewport resizes hold the workspace; exit restores preview + panel every time.

---

## Coverage gaps / not tested

- Edit-commit flows (making CSS/token/component-prop changes and verifying managed-stylesheet writes) — this run targeted inspection/selection UI per the brief; a follow-up battery should drive actual edits and verify the managed stylesheet + Changes log round-trip.
- Production builds (all testing against dev servers, where the tool is expected to be active) and the dev-only gating check (`import.meta.env.DEV` no-op in prod).
- The other example apps (`sandbox-tailwind-v3/v4`, `compat-vanilla-extract`, `sandbox-sprinkles`, `sandbox-next-webpack`) — not in scope per request.
- Keyboard navigation / screen-reader pass of the panel; contrast measurements.
- Canvas on astro/next/standalone — blocked by capability flag (Info above).

## Re-running

```bash
docs/qa/tools/run-all.sh            # full battery: astro → raw-html → next → react
```

Raw data: `docs/qa/issues-{astro,raw-html,next,react}.json` · Screenshots: `docs/qa/screenshots/<sandbox>/*.png` — baselines, tokens tabs, canvas states, and one screenshot per recorded issue.
