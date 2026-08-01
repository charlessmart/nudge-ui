# 0037 — Option/Alt measurement guides

**Labels:** enhancement, needs-triage
**Type:** AFK
**Milestone:** 2 — Core loop UX

## User story

As a designer, I can hold Option/Alt over the inspected page to see the
selected element's viewport alignment guides and its visual X/Y relationship to
the selectable element under the pointer.

## Acceptance criteria

- [x] In Inspect mode only, Option on macOS / Alt elsewhere shows four quiet,
      unlabeled full-viewport guides at the selected border-box edges while the
      pointer is over the host page.
- [x] Hovering a distinct selectable `data-cid` element adds red solid rulers,
      red dotted projections, and horizontally oriented whole-pixel labels.
- [x] Separated, diagonal, unequal-size, partially-overlapping, and containment
      cases follow the documented nearest-edge / far-edge geometry rules; a
      containment shows both meaningful inset measurements.
- [x] Solid rulers run through the selected element's centerline. Dotted
      extensions originate from hovered edges, meet rulers perpendicularly, and
      use the relevant nearest/far measurement endpoint. Margins are
      excluded, hovering the selected element has no self-measurements, and no
      pairwise ruler appears over blank page space.
- [x] The SVG overlay is `pointer-events: none`; normal selection and drag
      interactions retain their existing behavior.
- [x] Geometry has Vitest coverage, Playwright covers modifier activation and
      panel exclusion, and lint, typecheck, and the sandbox production build
      pass.

## Out of scope

- Canvas/iframe measurement guides.
- Multi-element alignment, snapping, or layout edits.
- CSS margin measurements or persistent guide state.

## Blocked by

None — can start immediately.
