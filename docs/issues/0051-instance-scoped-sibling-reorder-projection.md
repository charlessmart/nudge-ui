# 0051 — Instance-scoped sibling reorder projection

**Labels:** enhancement, needs-triage
**Type:** AFK
**Milestone:** 5 — Structural preview

## Parent

- `docs/features/durable-rendered-instance-projection.md`

## User story

As a designer, when I drag one repeated item or nudge it among siblings, the
same item has the same order in Inspect and Canvas without moving its sibling
instances from the same source site.

## What to build

Extend the canonical structural projection with `move`. Record stable
rendered-instance references for the target, destination parent, and optional
before-anchor. Retain `parentTag` and index only for Changes Log presentation;
they cannot be cross-document addressing data.

Use the existing legal-drop calculation for gesture feedback, but convert the
chosen drop location into canonical references before projecting. The document
adapter applies an instance-scoped sibling reorder after resolving all required
references.

## Acceptance criteria

- [x] Dragging or keyboard-nudging one sibling changes `ABC` to `BAC` in both
      Inspect and Canvas, regardless of where the gesture starts.
- [x] The same reorder survives a Canvas card becoming ready or reloading.
- [x] A repeated source-site sibling that was not selected is not moved.
- [x] Missing/ambiguous target, parent, or anchor produces a diagnostic and
      leaves the document unchanged.
- [x] Existing legality rules continue to reject invalid container/text
      combinations.
- [x] Unit tests cover reference capture, anchor order, and rejected
      resolution; Playwright covers drag, keyboard nudge, both mode directions,
      and frame reload.
- [x] `pnpm lint`, `pnpm typecheck`, relevant Vitest/Playwright suites, and
      `pnpm --filter sandbox build` pass with dev-only gating held.

## Out of scope

- Bulk/group move semantics.
- Structural history and persistence (0052 and 0053).

## Blocked by

- 0050 — Instance-scoped delete projection.
