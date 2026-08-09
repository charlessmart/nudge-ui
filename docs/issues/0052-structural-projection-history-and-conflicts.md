# 0052 — Structural projection history and conflicts

**Labels:** enhancement, needs-triage
**Type:** AFK
**Milestone:** 5 — Structural preview

## Parent

- `docs/features/durable-rendered-instance-projection.md`

## User story

As a designer, I can revert, undo, redo, or clear an individual structural
preview and understand whether React or changed data prevented the preview
from applying in a document.

## What to build

Move structural history from document-local `LiveMutation` stacks into the
controller-owned structural change set. Revert, undo, redo, and clear update
canonical state and reproject every mounted document. Document adapters may
keep node/placeholders privately only to restore a currently mounted document.

Report per-document `applied`, `missing`, `ambiguous`, and `overridden` states
in the Changes Log. Detect a later React reconciliation that removes an
applied marker, deletion, or move, but do not continuously reapply it.

## Acceptance criteria

- [x] Revert, undo, redo, and clear apply the same desired structural state to
      Inspect and every ready Canvas card.
- [x] Reverting a delete restores the correct rendered instance rather than a
      different source-site match.
- [x] Reverting a move restores the target's original relative placement.
- [x] React replacement after projection is shown as an overridden/conflict
      status and does not trigger an infinite reapply loop.
- [x] Changes Log distinguishes source site, rendered-instance scope, action,
      and per-document diagnostic state.
- [x] Unit tests cover history transitions and diagnostics; Playwright covers
      revert/undo/redo in each mode and after a card reload.
- [x] `pnpm lint`, `pnpm typecheck`, relevant Vitest/Playwright suites, and
      `pnpm --filter sandbox build` pass with dev-only gating held.

## Out of scope

- Persisting structural changes through a browser refresh (0053).
- Application-key identity adapters (0054).

## Blocked by

- 0051 — Instance-scoped sibling reorder projection.
