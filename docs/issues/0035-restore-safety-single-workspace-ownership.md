# 0035 — Restore safety and single-workspace ownership

**Labels:** needs-triage
**Type:** HITL
**Milestone:** 4 — Live Canvas workspace

## User story

As a designer returning to an older preview session, I can see when source
changes made an edit stale, and a second browser tab cannot silently overwrite
the active Design Tool workspace.

## What to build

Harden durable restoration against source drift and concurrent top-level tabs.
Restored element edits begin unverified and aggregate selector-match evidence
from the editable document and ready Canvas frames. A selector missing on only
one route is not stale; a change unmatched across the current workspace is
shown as stale/unmatched while retaining its exact selector and handoff data.
Token restoration compares persisted declaration identity/baseline with the
current catalog when possible.

Never delete, broaden, or claim success for a stale edit automatically. Give
the user individual revert and Clear Session paths.

Add a project-scoped, expiring top-level workspace lease. One tab owns Design
Tool writes; Canvas renderers never compete. A second top-level tab explains
the active owner and offers Take Over Here. Takeover restores the latest saved
state and invalidates the old owner. Lease heartbeat/expiry recovers from a
closed or crashed tab.

HITL verification covers the stale-state wording, takeover interaction, and
the old owner's loss-of-authority behavior.

## Acceptance criteria

- [ ] Restored element changes begin unverified rather than inheriting a prior document's preview result
- [ ] Match evidence is aggregated across the editable page and all ready Canvas cards before an element edit is called unmatched
- [ ] A source site absent from one route but present on another is not labelled stale
- [ ] An edit unmatched across the workspace remains visible with exact selector/source/prompt data and no false applied claim
- [ ] Restored token changes report declaration or baseline drift when the current catalog can prove it
- [ ] No stale edit is silently deleted, broadened to a different selector, or rewritten to a new token context
- [ ] Individual revert and Clear Session safely remove stale changes
- [ ] Only one top-level controller owns the project-scoped write lease at a time
- [ ] Canvas renderers never acquire, renew or contend for a workspace lease
- [ ] A second top-level tab leaves the host app usable, disables Design Tool writes, identifies an active workspace and offers Take Over Here
- [ ] Takeover restores the latest durable state, transfers ownership, and causes the old owner to stop writes
- [ ] Lease heartbeat and expiry recover automatically after a closed, crashed or suspended owner
- [ ] Storage/ownership events never synchronize divergent edit commands between tabs
- [ ] Unit tests cover aggregate stale classification, source drift, lease acquisition, expiry, takeover and lost ownership
- [ ] Multi-page Playwright coverage verifies cross-route matching and two-tab takeover without last-writer-wins corruption
- [ ] HITL review approves stale/restored messaging and ownership/takeover behavior
- [ ] Production output contains no lease, restore-safety or Canvas state
- [ ] `pnpm lint`, `pnpm typecheck`, relevant Vitest/Playwright suites and `pnpm --filter sandbox build` pass

## Blocked by

- #0034 — Durable Canvas and stable edit restoration

