# 0033 — Responsive spatial Canvas board

**Labels:** needs-triage
**Type:** HITL
**Milestone:** 4 — Live Canvas workspace

## User story

As a designer, I can arrange live routes on a zoomed-out board, resize each
card through real responsive breakpoints, and navigate the board without
stealing ordinary interactions from the applications inside it.

## What to build

Turn the route collection into the spatial board defined in
`docs/features/live-canvas-workspace.md`. Cards store world coordinates and
individual viewport sizes. The first card uses the current browser viewport;
new cards inherit the most recently used size and are placed to the right.

Implement Fit All, Space + drag panning, and Ctrl/Cmd + wheel zoom around the
pointer. Do not pan on an ordinary empty-board drag. Unmodified pointer, drag,
wheel, selection and control input must continue to reach cards and Canvas UI.
Card resizing changes the iframe's actual layout viewport rather than only
scaling a screenshot or outer visual.

HITL verification covers gesture feel, zoom limits, card chrome readability,
focus behavior, resize affordances, and responsive fidelity.

## Acceptance criteria

- [ ] Cards use stable world coordinates and do not depend on viewport-relative DOM order
- [ ] The first card starts at the current browser viewport size and new cards inherit the most recently used card size
- [ ] New cards receive deterministic non-overlapping placement to the right of existing content
- [ ] Per-card resize changes the iframe's actual CSS viewport and triggers host responsive breakpoints
- [ ] Holding Space and dragging pans even when the pointer begins above an iframe
- [ ] Ctrl/Cmd + wheel zooms around the pointer within documented minimum and maximum limits
- [ ] Ordinary empty-background dragging does not pan the board
- [ ] Unmodified iframe pointer, drag, wheel, text-selection and keyboard interactions remain usable
- [ ] Fit All frames every card with a useful margin and entering a new Canvas runs it once
- [ ] Card resize handles and toolbar controls work at non-1 zoom
- [ ] Canvas controls are keyboard reachable, labelled, focus-visible and do not trap focus
- [ ] Unit tests cover camera transforms, pointer-centered zoom, Fit All and resize coordinate conversion
- [ ] Playwright covers two responsive sizes, modified pan/zoom gestures, and unmodified in-frame interaction
- [ ] HITL review approves the spatial interaction and responsive card behavior
- [ ] Production output contains no board transforms or gesture handlers
- [ ] `pnpm lint`, `pnpm typecheck`, relevant Vitest/Playwright suites and `pnpm --filter sandbox build` pass

## Blocked by

- #0032 — Link-discovered route cards and edit handoff

