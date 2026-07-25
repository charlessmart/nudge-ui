# 0036 — DOM rearrangement and delete prototype

**Labels:** needs-triage
**Type:** Prototype
**Milestone:** 5 — Drag

## User story

As a designer, I can drag a selected tracked element to a legal DOM insertion
point or press Delete to remove it, see the running page reflow immediately,
and hand the structural intent to an agent.

## Acceptance criteria

- [x] Inspect supports pointer drag with a blue insertion line and immediate legal DOM move
- [x] Canvas cards support the same interaction through their controller/renderer protocol
- [x] Delete removes the selected tracked element in Inspect and Canvas
- [x] Moves and deletes are logged, individually revertible, undoable, and included in the prompt
- [x] Invalid text/container combinations such as `div` inside `span` are rejected
- [x] React snap-back is surfaced as temporary prototype feedback
- [x] Unit, Playwright, lint, typecheck, and production-gating verification pass

## Blocked by

- #0035 — Restore safety and single-workspace ownership
