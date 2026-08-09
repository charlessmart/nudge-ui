# 0050 — Instance-scoped delete projection

**Labels:** enhancement, needs-triage
**Type:** AFK
**Milestone:** 5 — Structural preview

## Parent

- `docs/features/durable-rendered-instance-projection.md`

## User story

As a designer, when I delete one repeated rendered item in Inspect or Canvas,
that same item disappears in the host and all matching Canvas documents while
its siblings remain visible.

## What to build

Add a controller-owned canonical structural change set and a versioned full
structural projection message. Implement the first structural operation:
`delete` with a `RenderedInstanceRef` target. Host and Canvas document adapters
resolve the same reference and apply the delete locally; Canvas renderers remain
projection-only under ADR-0006.

Wire delete gestures in both Inspect and Canvas to canonical intent instead of
committing a document-local `LiveMutation`. A newly ready or reloaded frame
receives the current structural projection. Per-document reports distinguish
applied, missing, and ambiguous results.

## Acceptance criteria

- [x] Deleting one repeated item in Inspect removes that item, but not its
      siblings, in the host and all ready Canvas cards.
- [x] Deleting the same item from Canvas has the identical result when
      returning to Inspect.
- [x] A ready/reloaded Canvas card receives the current delete projection.
- [x] The controller never sends a physical DOM node, placeholder, or
      renderer-local ID across documents.
- [x] Missing/ambiguous targets remain visible in that document and produce a
      diagnostic instead of deleting another matching item.
- [x] Unit tests cover structural projection validation, revision ordering, and
      resolver outcomes; Playwright covers both edit directions and frame
      reload.
- [x] `pnpm lint`, `pnpm typecheck`, relevant Vitest/Playwright suites, and
      `pnpm --filter sandbox build` pass with dev-only gating held.

## Out of scope

- Move/reorder projection (0051).
- Structural undo/redo and durable structural sessions (0052 and 0053).
- Delete all source-site matches.

## Blocked by

- 0049 — Durable rendered-instance CSS overrides.
