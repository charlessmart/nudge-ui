# 0021 — Canonical change set and edit history

**Labels:** needs-triage
**Type:** AFK
**Milestone:** 2 — Core loop reliability

## What to build

Separate current design intent from interaction history. Introduce a canonical
change set keyed by full target identity, edit scope and CSS property. Each
entry stores the original baseline, current requested value, token attribution
and preview result. Repeated edits to the same target/property update one
canonical delta instead of producing contradictory agent instructions.

Keep undo/redo as a separate ordered edit history. The managed stylesheet is a
pure projection of the canonical change set, while the prompt generator reads
only canonical baseline-to-current deltas. Clearing changes, reverting the last
delta or returning a property to its baseline must rebuild the sheet so visual
state, log state and prompt state cannot diverge.

Grouping and deduplication must include source location and scope so two JSX
sites with the same component name and file are never merged accidentally.

## Acceptance criteria

- [x] Canonical changes are keyed by complete source target, edit scope and property
- [x] Repeated edits preserve the first baseline and latest requested value as one current delta
- [x] Returning a property to its baseline removes the canonical delta
- [x] Undo and redo operate through a separate ordered edit history
- [x] Managed stylesheet output is a pure projection of the canonical change set
- [x] Prompt generation reads canonical baseline-to-current deltas rather than raw interaction history
- [x] Different lines/selectors in the same component file remain distinct in the log and prompt
- [x] Source-site and instance-preview changes are never deduplicated together
- [x] `clearChanges()` clears the managed stylesheet as well as log, undo and redo state
- [x] Single-change revert restores both the visual baseline and the prompt state
- [x] Unit tests cover repeated edits, return-to-baseline, clear, revert, undo/redo and distinct source locations
- [x] Sandbox e2e coverage verifies that the visible preview, changes log and copied prompt remain synchronized
- [x] Production build remains free of inspector state
- [x] `pnpm lint`, `pnpm typecheck`, unit tests and `pnpm --filter sandbox build` pass

## Blocked by

- #0019 — Source-site and unlinked-instance edit scope
- #0020 — Verified managed-style preview
