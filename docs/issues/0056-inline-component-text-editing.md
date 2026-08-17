# 0056 — Inline component text editing

**Labels:** enhancement, ready-for-agent
**Type:** AFK
**Milestone:** 6 — Inline text editing

## Parent

- `docs/features/inline-text-editing.md`

## What to build

Deliver the first source-faithful path: a designer can double-click visible
text produced by a unique React component invocation with a known string
`label`, similar text prop, or primitive `children`, edit it in place with a
scoped native editing host, and commit one existing canonical
`component-prop` change. The temporary DOM draft is removed before the React
Adapter rerenders the component.

Record the architectural decision for inline semantic and rendered-text
projection in a new ADR. Extend component contracts and JSX invocation
metadata for text props and `children` authorship without changing production
output.

## Acceptance criteria

- [x] Double-click starts an inline editing session on one confidently matched
      unique component text prop and shows which prop is being edited.
- [x] Known string props and runtime-string `children` can use a text contract;
      structural/implementation string props are not offered as visible text.
- [x] Enter/blur commits, Escape cancels, and one session creates one undo entry.
- [x] The native draft stands down from inspector selection, drag, navigation,
      structural actions, and Design Tool history shortcuts.
- [x] Commit removes temporary editing DOM before the React Adapter rerenders;
      Changes Log, revert, undo/redo, durable session, and prompt retain the
      prop callsite and authorship kind.
- [x] JSX/component instrumentation and runtime editing remain dev-only, with
      no new identity or editing output in production.
- [x] A new ADR records the semantic-text and rendered-text projection decision
      without modifying existing ADRs.
- [x] Unit tests cover contract extraction, binding confidence, lifecycle,
      canonical history, and prompt output; Playwright covers inline edit,
      cancel, commit, revert, and copy prompt.
- [x] `pnpm lint`, `pnpm typecheck`, relevant Vitest/Playwright suites, and
      `pnpm --filter sandbox build` pass with the dev-only contract held.

## Blocked by

None - can start immediately.
