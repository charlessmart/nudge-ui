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

- [ ] A commit verifies only the delta change; verification of prior changes
      does not run in the synchronous commit handler.
- [ ] Managed stylesheet writes touch only changed rules via CSSOM; the
      sheet stays last in `<head>` and edits still lose to author `!important`
      rules as before.
- [ ] Autosave is debounced and does not block the commit handler; a
      refresh/close within the debounce window still persists.
- [ ] Unit tests cover rule-diffing correctness (update/remove/restore
      round-trip through the managed sheet), delta verification semantics,
      and debounced persistence flush.
- [ ] Harness (0041): commit budget met with a long session (tens of
      accumulated edits) — cost no longer grows linearly per commit with
      session length.
- [ ] `pnpm lint`, `pnpm typecheck`, unit tests, and
      `pnpm --filter sandbox build` pass; production bundle unchanged
      (ADR-0002).

## Out of scope

- Cascade resolution caching (0042) and selection reveal (0043).
- Tokens-tab behavior (0045) and panel render architecture (0046).

## Blocked by

- 0041 — Large-app performance harness.
- 0042 — Resolution cache integrity.
