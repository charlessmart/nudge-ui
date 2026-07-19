# 0030 — Live Canvas runtime and current-route preview

**Labels:** needs-triage
**Type:** HITL
**Milestone:** 4 — Live Canvas workspace

## User story

As a designer editing a local route, I can switch to Canvas and see that route
as a live preview, then return to the same editable page without creating a
second Inspector or losing the host page's current state.

## What to build

Deliver the first end-to-end live Canvas path described in
`docs/features/live-canvas-workspace.md`. Add an Inspect/Canvas mode control to
the top-level Design Tool UI. Canvas renders as a fixed Shadow DOM workspace
containing one same-origin iframe card for the current route; Inspect remains
the only editing surface.

Split the dev bootstrap into top-level controller and explicitly marked Canvas
renderer roles. A Canvas renderer must not mount its own Inspector, overlay,
panel layout, or workspace state. Toggling back to the same route reveals the
still-mounted editable host document.

Write a new ADR for the live same-origin iframe architecture, including the
controller/renderer boundary and the replacement of screenshots. Update the
Canvas decision and Milestone 4 summary in `PLAN.md` to reference the feature
plan. Existing ADRs remain immutable.

HITL verification covers the mode control, transition, card chrome, and the
absence of confusing nested Inspector UI.

## Acceptance criteria

- [ ] A top-level Inspect/Canvas control is available in dev mode and Inspect remains the default for a new session
- [ ] Entering Canvas creates or focuses one live card for the current origin, pathname, search and hash
- [ ] Canvas is a fixed Shadow DOM preview workspace and does not mutate the host application's layout
- [ ] Returning to Inspect on the same route reveals the original still-mounted host document
- [ ] Inspect remains the only surface that permits Design Tool selection and editing
- [ ] Only an iframe explicitly marked by the Canvas controller enters renderer mode
- [ ] A Canvas renderer mounts no Inspector, selection overlay, panel layout, persistence owner, or duplicate shortcut handlers
- [ ] The renderer reports ready state, current URL and title to its owning card
- [ ] Frame or CSP failures produce recoverable card-level feedback rather than a screenshot fallback
- [ ] A new ADR records the live-frame controller/renderer decision and the ADR index is updated without modifying existing ADRs
- [ ] `PLAN.md` no longer specifies Canvas v1 as an html2canvas snapshot gallery and links to the detailed feature plan
- [ ] Unit tests cover runtime-role detection and mode transitions
- [ ] Playwright proves one live current-route card, no nested Inspector, and lossless toggle back to Inspect
- [ ] Production output contains no Canvas UI, frame marker, runtime protocol, or other inspector state
- [ ] `pnpm lint`, `pnpm typecheck`, relevant Vitest/Playwright suites and `pnpm --filter sandbox build` pass

## Blocked by

- #0021 — Canonical change set and edit history

