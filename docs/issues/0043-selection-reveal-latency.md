# 0043 — Selection reveal latency

**Labels:** enhancement, performance, needs-triage
**Type:** AFK
**Milestone:** 2 — Core loop performance

## User story

As a designer in a large app, clicking an element shows its styles in the
inspector within a frame budget — the cascade resolves in a single pass and
reuses matched-rule work across ancestors, states, and sibling instances.

## What to build

A vertical slice that collapses the O(ancestors² × rules) resolution on
selection into a single rule pass with reuse:

1. Hoist local-alias collection (`collectLocalAliases`,
   `resolution.ts:1306-1366`) out of `resolvePropertiesFromRules` so
   `resolveInheritedProperties` (`:1569-1606`) does not re-walk the full
   lineage × rules per ancestor; one matching pass over the rules for the
   element and its ancestors, with results shared.
2. Per-source-site matched-rule cache keyed on
   `(data-cid, data-src, data-dt-instance, interactionState, revision)`
   (identity is stable across remounts via `editScope.ts:14-21`), so
   repeated selections and sibling instances of the same source site reuse
   the matched rule set; only the inherited phase stays per-element.
3. Short-circuit `setSelectedElement` when cid/src/domElement are unchanged
   (`selectionStore.ts:46-52` compares object identity today), so
   `refreshSelected` after edits and re-clicks stop churning the panel.
4. Derive `getAvailableInteractionStates` (`resolution.ts:1750-1762`) from
   the cached rule snapshot in one pass instead of O(5 × rules) `matches`;
   memoize `getStableTokenProperty` per (element, revision).
5. Memoize `countSourceSiteMatches` (`editScope.ts:23-27`, full-document
   `querySelectorAll` per render) — recompute only when scope revision
   changes.
6. Replace the fixed 60 ms delay in `useResolvedProperties` with a
   trailing-edge debounce so rapid re-selection coalesces.

## Acceptance criteria

- [x] Selection resolution runs a single rule pass shared by the element,
      its ancestors, and interaction states; no per-ancestor full re-walk
      remains.
- [x] Selecting a second instance of the same source site reuses the cached
      matched-rule set.
- [x] Re-clicking the selected element and post-edit refreshes do not
      recreate selection identity or re-run the panel pipeline.
- [x] No full-document `querySelectorAll` runs in the selection render path
      on unchanged scope.
- [x] Unit tests cover the source-site matched-rule cache (remount
      survival, revision invalidation, instance disambiguation) and
      single-pass correctness vs the current resolution results.
- [x] Harness (0041): selection reveal and repeat-select budgets met.
- [x] `pnpm lint`, `pnpm typecheck`, unit tests, and
      `pnpm --filter sandbox build` pass; production bundle unchanged
      (ADR-0002).

## Results (2026-08-01, harness median of 3)

| Metric | Baseline | After 0042 | After 0043 | Budget |
| --- | --- | --- | --- | --- |
| Cold reveal | 1081 ms | 14.0 ms | 34.4 ms | 100 ms — PASS |
| Warm repeat-select | 795 ms | 116.3 ms | 17.6 ms | 30 ms — PASS |
| Edit commit | 410 ms | 456 ms | 79.0 ms | 50 ms — FAIL (0044) |
| Growth (#20 vs #1) | 8.71× | 8.47× | 39.97× | 2× — FAIL (0044) |

Growth ratio is inflated only because commit #1 dropped from 438 ms to
83.5 ms while commit #20 is unchanged (~3.3 s, 0044 scope). Both commit
metrics are resolved by 0044 (commit 4.4 ms, growth 0.94×).

Delivered by: single-pass `resolveLineage` sharing selector matches across
the element and its ancestors, a per-source-site matched-rule cache keyed on
`(data-cid, data-src, data-dt-instance, className, transform, revision)`,
`setSelectedElement` identity short-circuit, interaction states derived from
the cached match snapshot, memoized `countSourceSiteMatches`, and a
trailing-edge debounce replacing the fixed 60 ms delay.

**Regression fixed during verification:** the faster render exposed a
render/resolve loop — `TokenField`'s color-resolution `<span>` probes were
appended to `document.body` without `data-design-tool`, so the document
observer counted them, invalidating every resolution cache and re-rendering
the shell infinitely. Tagging those probes with `data-design-tool` restores
observer filtering. The `m2-tokens-panel` "picker stays bounded" spec was
hardened to wait for either the chip or raw state (it raced against the now
fast chip render). No new e2e failures remain vs `main` (9 pre-existing dev
failures; `m4-canvas-board` now passes).

## Out of scope

- Edit commit path (0044).
- React render/memoization architecture (0046).

## Blocked by

- 0041 — Large-app performance harness.
- 0042 — Resolution cache integrity.
