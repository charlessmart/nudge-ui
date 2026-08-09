# 0053 — Durable structural preview session and prompt handoff

**Labels:** enhancement, needs-triage
**Type:** AFK
**Milestone:** 5 — Structural preview

## Parent

- `docs/features/durable-rendered-instance-projection.md`

## User story

As a designer, my eligible individual CSS and structural preview changes
survive refresh and retain enough source and instance context for a coding
agent to implement them in the application.

## What to build

Persist canonical structural changes in the durable session alongside CSS,
token, and component changes. Bump the session schema and discard legacy
runtime-only `instance-preview` records rather than treating their generated
DOM IDs as durable identity. Restore controller state before projecting to the
host and ready Canvas cards.

Update prompt handoff to use canonical structural records and rendered-instance
evidence. It must describe the requested source/site item and action without
leaking generated projection-marker values as source implementation advice.

## Acceptance criteria

- [x] Eligible instance CSS overrides, deletes, and moves survive host refresh
      and Canvas frame reload through session restoration.
- [x] Session hydration restores canonical state without creating undo entries.
- [x] Legacy `instance-preview` records are safely discarded or retained only
      as non-durable diagnostics; they are never applied to a different item.
- [x] Clear session removes managed CSS markers, structural projections,
      histories, and diagnostics from all mounted documents.
- [x] Generated prompts include source site, bounded instance evidence, and
      move/delete intent, but no generated DOM marker.
- [x] Unit tests cover session schema validation, serialisation/hydration,
      legacy handling, and prompt output; Playwright covers refresh restoration
      for individual CSS, delete, and move.
- [x] `pnpm lint`, `pnpm typecheck`, relevant Vitest/Playwright suites, and
      `pnpm --filter sandbox build` pass with dev-only gating held.

## Out of scope

- Supporting arbitrary historical session-schema migrations beyond safely
      discarding obsolete runtime instance IDs.
- Bulk structural actions.

## Blocked by

- 0052 — Structural projection history and conflicts.
