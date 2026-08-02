# 0046 — Panel render architecture

**Labels:** enhancement, performance, needs-triage
**Type:** AFK
**Milestone:** 2 — Core loop performance

## User story

As a designer in a large app, selecting an element or committing an edit
feels immediate because the inspector panel re-renders only what changed,
and the panel render cost is flat regardless of selection or session size.

## What to build

A vertical slice that stops the whole-panel double re-render per selection
and per commit:

1. `React.memo` on the eight style editors, `TokenValueField`, and
   `TokenCatalogItem` with stable props (no new object/array literals per
   render from parents: `BorderEditor` slot arrays, `SpacingBox`
   side/pair slots, `LayoutSection` slot arrays, `Select` options).
2. `startTransition` around selection refresh
   (`refreshSelected` → `setSelectedElement`, `InspectorShell.tsx:183-187`)
   and around the post-edit re-resolution, so the committed value paints
   before the panel re-resolves; keep the click-to-select path in a
   transition where safe.
3. End the two-wave re-render per commit: selection identity no longer
   changes on edit (see 0043), and the debounced resolution wave does not
   re-render the whole shell — only the resolved rows and their consumers.
4. Reduce per-render host reads in render bodies where feasible (hoist
   `getStateStyleValue` reads into revision-driven effects; editors already
   have `layoutRevision`-style mechanisms to extend).
5. `useDeferredValue` for catalog filtering if not already done by 0045.

## Acceptance criteria

- [ ] Selecting an element or committing an edit re-renders only affected
      subtrees; unchanged editors do not re-render (verified by render
      counting in tests or harness).
- [ ] Selection refresh and post-edit resolution are wrapped in
      transitions; no regression in host-element update timing.
- [ ] The panel paints the committed value before the resolution wave
      completes.
- [ ] Unit tests cover editor memoization props stability and render
      counting for representative editors.
- [ ] Harness (0041): commit budget met and reveal budget met with the
      panel fully open.
- [ ] `pnpm lint`, `pnpm typecheck`, unit tests, and
      `pnpm --filter sandbox build` pass; production bundle unchanged
      (ADR-0002).

## Out of scope

- Resolution algorithm and caches (0042, 0043).
- Commit-path verification and sheet writes (0044).
- Tokens-tab data layer (0045).

## Blocked by

- 0041 — Large-app performance harness.
