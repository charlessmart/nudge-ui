# 0038 — Canvas Option/Alt measurement guides

**Labels:** enhancement, needs-triage
**Type:** AFK
**Milestone:** 2 — Core loop UX

## User story

As a designer, I can hold Option/Alt while my pointer is inside the selected
Canvas card to see the same alignment and pairwise measurements as Inspect
mode, projected over that card's visible iframe viewport.

## Acceptance criteria

- [x] Renderer frames report their local Option/Alt and pointer-presence state
      to the parent using the identity-bound Canvas protocol.
- [x] Canvas reuses the established measurement geometry and renderer, mapping
      only line endpoints from iframe CSS pixels through the board camera.
- [x] Labels retain unscaled whole-CSS-pixel distances at every Canvas zoom.
- [x] Guides span only the selected card's visible iframe viewport. A pointer
      in another card or outside the iframe shows no measurement guides.
- [x] A distinct selectable element in the same iframe gets rulers and
      projections; hovering the selected element shows alignment guides only.
- [x] Unit and Canvas Playwright coverage pass alongside lint, typecheck, and
      the sandbox production build.

## Out of scope

- Cross-card or cross-iframe measurements.
- Extending guides through the Canvas toolbar, board, or inspector panel.

## Blocked by

0037 — Option/Alt measurement guides.
