# 0041 — Large-app performance harness

**Labels:** enhancement, needs-triage
**Type:** AFK
**Milestone:** 4 — Performance hardening

## User story

As a maintainer, I can run a repeatable performance harness against a
synthetic large host app (deep tree, thousands of CSSOM rules) so that
selection-reveal and edit-commit latency regressions are caught as Playwright
budget gates with a recorded baseline.

## Context

`docs/features/large-app-responsiveness.md` identifies the measured hot spots:
cold cascade re-resolution per selection (O(ancestors² × rules)), whole-sheet
re-serialization and full-DOM verification per commit, and session-length
commit growth. This issue builds the harness that makes those numbers
visible: a dev-only synthetic fixture plus a Playwright `perf` project with
budget assertions, isolated so red baselines do not break `pnpm test:e2e`.

## Metric targets (from the feature doc)

| Metric | Target |
| --- | --- |
| Selection reveal (click → styles visible), first selection (cold) | < 100 ms |
| Repeat-select of the same element (warm) | < 30 ms |
| Edit commit (Enter → host update + panel refresh) | < 50 ms |
| Commit #20 vs commit #1 in one session | <= 2× |

## Acceptance criteria

- [x] A deterministic dev-only synthetic fixture mounts ~600 elements at depth
      ~12 with `data-perf-id` targeting and a Tailwind-scale generated
      stylesheet of ~5000–8000 rules across 4 `<style>` elements, including
      `:hover`/`:focus` states, `@media` blocks, and an `@container` block.
- [x] The fixture is gated behind `import.meta.env.DEV` and mounted only for
      `/?perf=large`; the production build contains no fixture code, no
      `data-perf-id`, and no design-tool strings (verified by grep on `dist/`).
- [x] A `perf` Playwright project runs `perf.large.dev.spec.ts` only, with
      `testIgnore` on the dev/prod projects, and `pnpm test:e2e` runs only
      dev+prod so perf budget failures never break it.
- [x] The spec measures cold reveal, warm repeat-select, edit commit, and a
      20-commit session-growth sequence with in-page `performance.now()`
      deltas and rAF polling, 3–5 runs per metric, reporting medians.
- [x] Budget assertions produce clear failure messages; `PERF_RECORD_BASELINE=1`
      skips budget assertions, writes `test-results/perf-baseline.json`, and
      logs the measurement table.
- [x] `pnpm --filter sandbox build`, `pnpm lint`, `pnpm typecheck`, and unit
      tests pass; existing dev e2e specs do not pick up the perf spec.

## Baseline (2026-08-01, recorded via `pnpm perf:baseline`)

| Metric | Median of 3 | Budget | Status |
| --- | --- | --- | --- |
| Cold reveal | 1081 ms | 100 ms | FAIL (10.8×) |
| Warm repeat-select | 795 ms | 30 ms | FAIL (26.5×) |
| Edit commit | 410 ms | 50 ms | FAIL (8.2×) |
| Growth (commit #20 vs #1) | 8.71× | 2× | FAIL |

`pnpm perf` fails all four budgets on the current code, proving the gate.

## Out of scope

- Any optimization of the inspector/plugin runtime (slices 0042–0048).
- Performance work against the real production-scale host app.
- Canvas mode latency measurement.

## Blocked by

- Nothing.
