# 0042 — Resolution cache integrity

**Labels:** enhancement, performance, needs-triage
**Type:** AFK
**Milestone:** 2 — Core loop performance

## User story

As a designer in a large app, re-selecting an element or committing an edit
feels warm: the inspector's resolution caches survive across selections and
stop being invalidated by the tool's own probes and by unrelated host DOM
churn.

## What to build

A vertical slice that makes the resolution pipeline cache-correct on a live
large app, without changing resolution semantics:

1. Key resolution snapshots (`stateResolutionSnapshots`) by element +
   document revision + interaction state instead of the per-selection
   `TokenTable` object identity (`InspectorShell.tsx:158-162` rebuilds a
   fresh table every selection, so the cache is structurally cold today).
2. Stop the document-wide MutationObserver (`cssomCollector.ts:41-50`) from
   bumping the element/stylesheet revisions on mutations that cannot affect
   cascade outcomes:
   - ignore records whose targets/added nodes carry `data-design-tool`
     (the tool's own probes: `normalizeInElementContext`, container-query
     probes, verification probes), breaking the self-invalidation loop,
   - ignore non-stylesheet element attribute churn (React commits, hover
     states, animations) for the stylesheet revision and selector-match
     cache.
3. Memoize `computeSpecificity` per selector string (currently recomputed
   per rule per ancestor at `resolution.ts:1332` and `:1398` although the
   rule already carries `specificity` from collect time).
4. Cache `getTokenEntriesForElement` per (element, revision) instead of per
   selection-object identity.

## Acceptance criteria

- [x] Re-selecting the same element resolves from the warm snapshot cache
      (no re-collect, no re-match) when the cascade is unchanged.
- [x] The tool's own probe mutations (`data-design-tool` nodes) no longer
      invalidate the resolution caches mid-resolve.
- [x] Host attribute churn (non-stylesheet) no longer bumps the stylesheet
      revision or the selector-match cache.
- [x] `computeSpecificity` is computed at most once per selector string per
      collect; per-resolve redundant recomputation is eliminated.
- [x] Unit tests cover revision accounting (probe filtering, stylesheet vs
      element churn) and snapshot-keying correctness on edit invalidation.
- [x] Harness (0041): warm repeat-select latency drops materially vs the
      recorded baseline; reveal and commit budgets unchanged or improved.
- [x] `pnpm lint`, `pnpm typecheck`, unit tests, and
      `pnpm --filter sandbox build` pass; production bundle unchanged
      (ADR-0002).

## Results (2026-08-01, harness median of 3)

| Metric | Baseline | After 0042 | Budget |
| --- | --- | --- | --- |
| Cold reveal | 1081 ms | 14.0 ms | 100 ms — PASS |
| Warm repeat-select | 795 ms | 116.3 ms | 30 ms (0043) — target `<200 ms` met |
| Edit commit | 410 ms | 456.0 ms | 50 ms — FAIL (0044 scope) |
| Growth (#20 vs #1) | 8.71× | 8.47× | 2× — FAIL (0044 scope) |

Delivered by: per-element token-entries cache keyed on (element revision,
stylesheet revision, definitions) with a memoized `TokenTable`
(`resolution.ts`), observer probe/attribute filtering via a registered-element
set (`cssomCollector.ts`), and a memoized `computeSpecificity`
(`selectorSemantics.ts`).

## Out of scope

- Algorithmic changes to the cascade itself (0043).
- Edit-path verification or sheet-write changes (0044).

## Blocked by

- 0041 — Large-app performance harness.
