# 0057 — Durable rendered-text projection

**Labels:** enhancement, ready-for-agent
**Type:** AFK
**Milestone:** 6 — Inline text editing

## Parent

- `docs/features/inline-text-editing.md`

## What to build

Add the framework-neutral fallback for eligible direct leaf text and component
copy that cannot be mapped safely to a semantic prop. Commit a canonical
`text-content` record, project it into the Inspect document and Canvas
renderers, persist it across refresh, and include it in the Changes Log and
agent prompt.

Own text identity in a dedicated document projection so editing visible text
does not invalidate the original rendered-instance evidence. Resolve against
safe before/after evidence, validate the post-edit marker and new value, and
never broaden an ambiguous instance.

## Acceptance criteria

- [x] Eligible plain leaf text can be edited in place when no confident
      component prop binding exists; rich descendant markup is preserved and
      unsafe targets are rejected.
- [x] `text-content` has explicit type guards and is never interpreted as a CSS
      element change or emitted into the managed stylesheet.
- [x] Canonical merge, revert, undo/redo, clear, Changes Log, prompt, and
      session serialization preserve original-to-final text intent.
- [x] Host and Canvas document Adapters apply one controller-owned text
      projection and report applied/missing/ambiguous/overridden outcomes.
- [x] Text projection uses its own document-local marker, accepts safe before
      or after evidence on initial resolution, and validates applied state
      without comparing it back to the original text.
- [x] React reconciliation does not cause a reapply loop; undo/clear restores
      the original only while the marked node still holds the projected value.
- [x] Frame protocol and session schema validation reject malformed text
      projections and remain versioned/dev-only.
- [x] Unit tests cover identity, projection, conflict, canonical state,
      protocol/session round trips, and prompt output; Playwright covers host
      edit, refresh restoration, Canvas projection/reload, revert, and prompt.
- [x] `pnpm lint`, `pnpm typecheck`, relevant Vitest/Playwright suites, and
      `pnpm --filter sandbox build` pass with the dev-only contract held.

## Blocked by

- 0056 — Inline component text editing.
