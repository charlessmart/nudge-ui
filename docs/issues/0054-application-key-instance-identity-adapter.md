# 0054 — Application-key instance identity adapter

**Labels:** enhancement, needs-triage
**Type:** HITL
**Milestone:** 5 — Structural preview follow-on

## Parent

- `docs/features/durable-rendered-instance-projection.md`

## User story

As a designer editing a data-driven list that can be sorted, filtered, or
refreshed, I can target one item by its stable application identity instead of
depending on rendered occurrence or visible text.

## What to build

Add an opt-in, dev-only application-key identity adapter to the rendered
instance resolver. Define the user-facing contract for exposing an existing
stable item identifier, the accepted attribute/value format, and privacy rules
for what may be persisted or included in prompt evidence.

The core resolver prefers this key when it is available and otherwise uses the
safe evidence resolver from 0049. This must remain framework-neutral: do not
read React Fiber/internal keys or make React-specific assumptions in canonical
records.

## Acceptance criteria

- [ ] The documented opt-in key identifies the same item after sort, filter,
      refresh, and Canvas/Inspect switching.
- [ ] Individual CSS, delete, and move operations prefer a matching stable
      application key over ordinal/text evidence.
- [ ] Absent or malformed keys fall back to conservative evidence resolution
      without broadening or choosing a different item.
- [ ] The UI explains when a stable application key is in use and when an item
      is unresolved or ambiguous.
- [ ] Key values are dev-only and subject to an agreed privacy policy for
      durable sessions and prompt output.
- [ ] Unit and Playwright fixtures cover a keyed list reordered between
      projection applications; production output remains free of the adapter.
- [ ] `pnpm lint`, `pnpm typecheck`, relevant Vitest/Playwright suites, and
      `pnpm --filter sandbox build` pass with dev-only gating held.

## Out of scope

- Inferring React keys through Fiber internals.
- Support for every possible framework list/key syntax.

## Blocked by

- 0049 — Durable rendered-instance CSS overrides.
