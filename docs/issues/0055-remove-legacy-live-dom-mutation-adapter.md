# 0055 — Remove the legacy live-DOM mutation adapter

**Labels:** enhancement, ready-for-agent
**Type:** AFK
**Milestone:** 5 — Structural preview

## Parent

- `docs/features/durable-rendered-instance-projection.md`

## User story

As a maintainer, I can follow one structural-preview path from an Inspect or
Canvas gesture to canonical controller intent, projection, presentation, and
prompt handoff without encountering a dormant document-local mutation path.

## What to build

Replace the remaining `domMutations` facade with two focused modules:

- a structural-gesture module that owns only document-local drop geometry and
  converts a user gesture into a canonical structural action; and
- canonical structural presentation consumed by the Changes Log, keyboard
  shortcuts, clear-session, and prompt handoff.

Remove the unused `LiveMutation` implementation: node and placeholder state,
document observers, local mutation undo/redo stacks, `outerHTML`,
`instance-preview` presentation scope, and the legacy prompt fallback.
Document adapters may still keep physical preview state privately inside
`structuralProjection`; that is not the old controller-side live mutation
mechanism.

## Acceptance criteria

- [x] Inspect and Canvas delete, drag, nudge, revert, undo, redo, and clear
      invoke canonical structural state directly.
- [x] Drop hit-testing and insertion-guide geometry remain available without
      exposing document-local nodes as durable structural data.
- [x] Changes Log and Copy Prompt consume canonical `StructuralChange` records
      directly; prompt output contains no legacy DOM-mutation fallback.
- [x] No runtime import or exported type refers to `domMutations`,
      `LiveMutation`, `DomMutationRecord`, or `instance-preview` structural
      records.
- [x] Unit tests cover gesture legality and canonical history/presentation;
      relevant Playwright delete, reorder, revert, undo/redo, refresh, and
      Canvas-reload flows pass.
- [x] `pnpm lint`, `pnpm typecheck`, relevant Vitest/Playwright suites, and
      `pnpm --filter sandbox build` pass with dev-only gating held.

## Out of scope

- Different structural actions such as wrapping, cross-container moves, or
      bulk source-site operations.
- Application-key identity adapters (0054).

## Blocked by

- 0053 — Durable structural preview session and prompt handoff.
