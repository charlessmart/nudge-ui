# 0034 — Durable Canvas and stable edit restoration

**Labels:** needs-triage
**Type:** AFK
**Milestone:** 4 — Live Canvas workspace

## User story

As a designer, refreshing the browser restores my Canvas board and stable
preview edits automatically, while temporary selection, history and unlinked
instance state reset honestly.

## What to build

Add a versioned, project-scoped durable session for Canvas workspace state and
stable canonical changes. The plugin supplies a dev-only project identifier
derived from the resolved Vite root, with an explicit configuration override,
without exposing the absolute path to browser storage.

Persist mode, Inspect URL, cards, geometry, titles, camera, and canonical
source-site/global-token changes. Do not persist undo/redo, selection,
document-derived preview verification, iframe application state, or
`instance-preview` changes. Hydration validates the schema, creates no undo
entry, rebuilds the top-level managed stylesheet, and lets ready frames receive
the normal latest projection.

Restore automatically, show a compact restored-state notice, and provide Clear
Session. Instance-only edits must state that they will not survive refresh.
Malformed or unknown-version data fails closed without breaking the host app.

## Acceptance criteria

- [ ] Storage keys include schema version and a dev-only project ID rather than an absolute project path
- [ ] The plugin supports an explicit project-ID override and emits no ID/session metadata in production
- [ ] Mode, Inspect URL, cards, URLs, titles, positions, viewport sizes and camera are persisted after canonical state changes
- [ ] Canonical source-site and global-token changes serialize without DOM references or transient verification state
- [ ] Undo/redo stacks, current selection, iframe application state and `instance-preview` changes are not persisted
- [ ] Instance-preview UI clearly states that the edit is active only for the current document lifetime
- [ ] Hydration validates its schema, creates no undo entry, and rebuilds the editable page's managed stylesheet
- [ ] Canvas renderers receive restored edits through the ordinary full-projection readiness path
- [ ] Refresh in Canvas returns to Canvas with the same routes, card geometry and camera
- [ ] Refresh in Inspect restores the selected route and stable managed previews
- [ ] Automatic restoration shows the number of restored preview changes and an accessible Clear Session action
- [ ] Clear Session removes durable workspace/edit state, canonical state, managed CSS and history and returns to a valid Inspect baseline
- [ ] Malformed, partial and unknown-version data applies no CSS and offers safe discard without breaking the host app
- [ ] Unit tests cover schema round trips, exclusions, malformed data, hydration and clear
- [ ] Playwright refreshes in both modes and verifies stable edits restore while history and instance-only edits do not
- [ ] Production output and browser storage contain no Canvas or persisted inspector state
- [ ] `pnpm lint`, `pnpm typecheck`, relevant Vitest/Playwright suites and `pnpm --filter sandbox build` pass

## Blocked by

- #0033 — Responsive spatial Canvas board

