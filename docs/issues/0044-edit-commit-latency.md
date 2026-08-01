# 0044 — Edit commit latency

**Labels:** enhancement, performance, needs-triage
**Type:** AFK
**Milestone:** 2 — Core loop performance

## User story

As a designer in a large app, committing an edited value updates the host
element instantly, and the cost of committing does not grow with how many
edits I have already made this session.

## What to build

A vertical slice that removes the O(changes × DOM) and whole-sheet work from
the synchronous commit path:

1. Delta verification: verify only the just-committed change instead of
   re-verifying every accumulated change (`changes/projection.ts:87-101`
   runs `querySelectorAll` + `verifyPreview` probes per change, per commit).
2. Defer verification off the input path (rAF/`requestIdleCallback`
   coalesced) so the commit handler returns before any probe work.
3. Incremental managed-stylesheet writes: replace the whole-sheet
   `el.textContent = rulesToCssText(...)` (`managedStylesheet.ts:119-127`)
   with targeted CSSOM updates (`insertRule`/`deleteRule`/per-rule
   `style.setProperty`) that diff only the changed rules, preserving the
   ADR-0003 managed-stylesheet contract and the keep-last guard
   (`managedStylesheet.ts:33-56`).
4. Debounced autosave: coalesce the synchronous full-session
   `JSON.stringify` + `localStorage.setItem`
   (`sessionStore.ts:361-405, 579-582`) behind a trailing timer (or
   `requestIdleCallback`), flushing on `beforeunload`.
5. Avoid `[...stack]` full-array copies per edit where they contribute to
   O(n²) session growth (`changesLog.ts:70`, `domMutations.ts:327-331`).

## Acceptance criteria

- [x] A commit verifies only the delta change; verification of prior changes
      does not run in the synchronous commit handler.
- [x] Managed stylesheet writes touch only changed rules via CSSOM; the
      sheet stays last in `<head>` and edits still lose to author `!important`
      rules as before.
- [x] Autosave is debounced and does not block the commit handler; a
      refresh/close within the debounce window still persists.
- [x] Unit tests cover rule-diffing correctness (update/remove/restore
      round-trip through the managed sheet), delta verification semantics,
      and debounced persistence flush.
- [x] Harness (0041): commit budget met with a long session (tens of
      accumulated edits) — cost no longer grows linearly per commit with
      session length.
- [x] `pnpm lint`, `pnpm typecheck`, unit tests, and
      `pnpm --filter sandbox build` pass; production bundle unchanged
      (ADR-0002).

## Out of scope

- Cascade resolution caching (0042) and selection reveal (0043).
- Tokens-tab behavior (0045) and panel render architecture (0046).

## Blocked by

- 0041 — Large-app performance harness.
- 0042 — Resolution cache integrity.

## Results (2026-08-01, harness median of 3)

| Metric | Before 0044 | After 0044 | Budget |
| --- | --- | --- | --- |
| Cold reveal | 34.4 ms | 36.7 ms | 100 ms — PASS |
| Warm repeat-select | 17.6 ms | 14.2 ms | 30 ms — PASS |
| Edit commit | 79.0 ms | 5.0 ms | 50 ms — PASS |
| Growth (#20 vs #1) | 39.97× | 0.94× | 2× — PASS |

Delivered by: delta-only verification scheduled off the commit path via
`requestIdleCallback` (`changesLog.ts` `markForVerification`/`flushVerification`),
incremental CSSOM writes diffing only changed rules (`managedStylesheet.ts`
`applyRules`), trailing-debounced autosave (`sessionStore.ts` `scheduleAutoSave`),
and `push`/`pop` history stacks (`changesLog.ts`, `domMutations.ts`).

Verification: 954 unit tests (856 inspector + 98 plugin), `pnpm lint`,
`pnpm typecheck`, sandbox build with identical dist hashes
(`index-D0sGTtXL.css` / `index-BKTszAt1.js`) and 0 `data-design-tool` matches
in the production bundle (ADR-0002), and dev e2e with only the 9 pre-existing
`main` failures. Two e2e specs (`m2-preview-conflict:3`, `m2-style-editors:58`)
now poll the deferred text mirror instead of reading `textContent` synchronously.
