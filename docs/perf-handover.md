# Handover: Inspector Performance Optimization

Date: 2026-08-31
Status: **Rounds 2–3 complete and validated**

## Mission

Three rounds of perf optimization on the Nudge UI inspector. Round 3 resumed
hover and drag validation, added an explicit drag-to-feedback benchmark, and
removed conservative sources of redundant work from CSS edits and canvas hover
bursts. All work is uncommitted in the working tree on `main`.

Constraints given by the user (do not violate):

1. Do **not** significantly change the existing cache/revision strategy.
   Suggestions for bigger cache changes are welcome, implementations are not.
2. **No changes to existing UI or end-user behavior.**
3. Perf work was orchestrated via glm-flash subagents; the orchestrator (me)
   independently reviewed diffs and re-ran tests.

## How to measure

From `examples/sandbox` (dev server auto-starts; workers: 1):

```bash
npx playwright test --project=perf          # full suite, 9 tests, ~35s
npx playwright test --project=perf -g "session growth"   # commit outliers
npx playwright test --project=perf -g "cold selection|warm repeat"  # reveal
pnpm --filter @nudge-ui/inspector test:unit  # 1176 tests
pnpm --filter @nudge-ui/inspector typecheck
```

Budgets (do NOT relax them to make things pass): cold reveal 100ms, warm
reveal 30ms, commit 50ms, growth ratio ≤2x, canvas hover/click 100ms.

## Current working tree (all intentional — do not revert)

**Perf runtime changes** (rounds 1+2):

- `packages/inspector/src/changes/projection.ts` — verification probes targets
  lazily, stops at first conflict (provably identical result). Fixed the ~1.7s
  `border-width` outlier: source-site selector matched 600 nodes, each conflict
  ran `hasImportantAuthorRule` (~2.4ms × 600).
- `packages/inspector/src/tokens/resolution.ts` — (r1) `getAvailableInteractionStates`
  skips states whose pseudo appears in no snapshot selector; `prewarmCssomRuleSnapshot()`.
  (r2) revision-keyed memo in `matchingSelectorBranch` (the big reveal win:
  stable sweep 66–86ms → 8–12ms); memo for `getAllElementMatches`; **plus my
  safety guards** (see "Correctness guards I added" below).
- `packages/inspector/src/inspection/browserCssInspection.ts` — skip
  interaction-state sweep for `cascade:"stable"`; optional `prewarmRules()` hook.
- `packages/inspector/src/inspection/useBrowserCssInspection.ts` — (r1) post-commit
  revision refresh split across frames (authored now, stable next frame).
  (r2) leading-edge selection resolve (8ms debounce now trailing-only);
  idle prewarm of CSSOM snapshot at session mount (requestIdleCallback, 2s timeout).

**Perf harness fixes** (test-only; all were broken/stale before):

- `examples/sandbox/tests/perf.canvas.dev.spec.ts` — click probe moved from leaf
  to iframe `document` (renderer's `blockApplicationClick` stopPropagation means
  a leaf listener can never fire; commit 2e27ef0 introduced this).
- `examples/sandbox/tests/perf.large.dev.spec.ts` — (a) margin group revealed via
  `add-value` at step 8 (individual-sides toggle *replaces* grouped rows, so
  `margin-vertical` never existed at step 9); (b) storage-reset init script
  tracked per-page in a `WeakSet` (Playwright gives each test a fresh page; the
  old module-level flag meant later tests rehydrated a previous test's autosaved
  edits and the reveal check never matched).
- `examples/sandbox/tests/perf.hover.dev.spec.ts` (new, untracked) — same-document
  hover reveal/switch metrics. Regression coverage only; user cancelled the
  hover optimization round. Hover measures ~7–8ms (one frame), already fine.

**Unrelated user work in the tree** — leave untouched:
`docs/agent-bridge-debug-report.md`, `packages/inspector/src/ChangesLog.tsx` +
`ChangesLog.test.tsx` (a `size="compact"` removal).

## Correctness guards I added on top of round 2

The round-2 subagent memoized `matchingSelectorBranch` and `getAllElementMatches`
without distinguishing selector kinds. The **"live" transform passes raw
selector text** (`:hover`-bearing), and the pre-existing design deliberately
matches element-sensitive selectors fresh (`isElementSensitiveSelector` /
element-sensitive bucket). Both memos could have frozen live-state-dependent
matches. I added:

- `matchingSelectorBranch`: skip memoization when
  `TRANSIENT_SELECTOR.test(selectorText) || isElementSensitiveSelector(selectorText)`.
- `getAllElementMatches`: no memoization for `transform === "live"`.

Typecheck + 1176 unit tests pass **with these guards**. Perf suite re-validation
with guards is what's missing (see below).

## Measured results so far (medians, large fixture: 600 nodes, ~8k rules)

| metric | baseline | after r1 | after r2 (subagent's numbers, pre-guard) |
|---|---|---|---|
| cold reveal (budget 100) | ~95ms | ~86ms | 21–29ms |
| warm reveal (budget 30) | ~23ms, first run 82–106ms | ~23ms, outliers gone on commit path | 15–16ms, first run 13–21ms |
| edit commit (budget 50) | 2.9–3.3ms (isolated) | 2.7–3.9ms | 3.2–3.4ms |
| growth ratio (≤2x) | 1.12–2.00x w/ 1.7s outliers | 1.04x, max commit 22ms | ~1.0x |
| canvas hover/click | 7.9 / 5.9ms | 7.9 / 5.9ms | unchanged |

Baseline JSONs: `examples/sandbox/test-results/perf-baseline{,-canvas,-hover}.json`.

## Validation outcome

Round 2's guarded numbers hold. The apparent hang was caused by Playwright
reusing unrelated servers on ports 5173 and 4173. Run the suite with `CI=1` and
dedicated ports so Playwright starts and owns both servers:

```bash
cd examples/sandbox
CI=1 NUDGE_UI_DEV_PORT=5399 NUDGE_UI_PROD_PORT=4399 \
  pnpm exec playwright test --project=perf --reporter=line
```

Final isolated run: 11/11 performance tests passed. Inspector unit tests
(1,182), inspector typecheck, sandbox typecheck, and focused inspect/canvas
hover, edit, and drag regressions also passed.

## Round 3 retained changes

- `packages/inspector/src/InspectorShell.tsx` — CSS-only edits no longer
  re-resolve unchanged component metadata.
- `packages/inspector/src/componentSemantics/reactRuntime.tsx` — identical
  semantic override projections are true no-ops and do not notify React
  subscribers during unrelated CSS edits.
- `packages/inspector/src/canvas/rendererElementSelector.ts` — canvas hover
  geometry and message construction now coalesce inside the existing frame
  throttle; a 50-event burst performs one geometry read and sends one message.
- `packages/inspector/src/tokens/resolution.ts` — inactive-rule matching caches
  only state-independent selectors; selectors such as `:checked` remain fresh.
- `examples/sandbox/tests/perf.drag.dev.spec.ts` — measures the time from the
  first threshold-crossing mouse move (captured before Nudge handlers) to the
  first visible insertion guide in inspect and canvas modes.

Final measurements on the 600-node / ~8k-rule fixture:

| metric | final result |
|---|---|
| same-document hover reveal / switch | 6.2ms / 7.6ms median |
| canvas hover | 7.0ms median |
| inspect drag guide | 66.7ms p50, 80.8ms p95 |
| canvas drag guide | 66.8ms p50, 86.5ms p95 |
| cold / warm selection reveal | 19.6ms / 13.2ms median |
| edit commit to rendered UI | 3.6ms median |
| session growth ratio | 1.09x |

One known harness signal remains: the first canvas-click sample is consistently
around 170–210ms while subsequent samples are about 5–6ms. The three-run median
passes, but a future cold-click benchmark should expose this separately instead
of treating it as warm-path latency.

## Known pre-existing failures (NOT ours; verified on clean HEAD via stash)

- `tests/m2-selector.dev.spec.ts` tests 1–3 (stale `/playground` expectations:
  missing breadcrumb, missing `#primary-demo-button`/selection fixture)
- `tests/m4-canvas-element-select.dev.spec.ts` "non-anchor" (also `/playground`)

Everything else in the dev e2e project: 186 passed, 0 failed (as of r2).

## Unimplemented cache-strategy suggestions (user asked for these as suggestions only)

1. Let `transformedRulesMemo` / `sourceSiteMatchBucketsMemo` / source-site match
   cache survive content-identical snapshot rebuilds — currently every
   stylesheet revision forces a full ~8k-rule walk (~17–23ms) + re-match.
   Would roughly halve refresh blocking.
2. Derive the stable cascade from the authored lineage when no transient-pseudo
   rules match (halves it again).
3. Prefilter rules before `el.matches()` (class/attr fast-negation) — cuts the
   irreducible first-touch authored sweep (~45–60ms), but is a matching-engine
   restructuring.
4. Memoize `hasImportantAuthorRule` per (document, revision, property).
5. The perf metric has a blind spot: `clickAt` registers after the inspector's
   capture-phase click listener, so in-handler work is invisible. A
   mousedown-based `clickAt` would be more honest (pre-existing; not changed).

## History of this effort

- Found the perf suite had 3 broken tests (all harness bugs, fixed above).
- Round 1 (subagent): commit-path outliers → verification short-circuit +
  split refresh. Verified: 9/9 perf, 1176 unit, typecheck, e2e (modulo
  pre-existing failures).
- Round 2 (subagent): reveal latency → branch memo + leading-edge resolve +
  idle prewarm. Subagent reported 9/9 ×2 + full e2e + unit + typecheck.
- I reviewed r2's diff, found the live-transform memoization hazard, added
  guards, re-verified unit + typecheck — then the perf suite started hanging
  (suspected environmental; see above). **That's where you pick up.**

Remaining optional work after validation: another round could target the
in-click-handler authored sweep (mousedown-based measurement first), or the
per-revision cold match walk — but per constraint 1, those need user sign-off
on cache-strategy changes first.
