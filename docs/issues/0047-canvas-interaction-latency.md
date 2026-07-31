# 0047 — Canvas interaction latency

**Labels:** enhancement, performance, needs-triage
**Type:** AFK
**Milestone:** 2 — Core loop performance

## User story

As a designer using Canvas mode with a large card, hovering and clicking
elements feels immediate because interactions no longer scan the whole card
DOM per pointer event or flood the controller with messages.

## What to build

A vertical slice that removes O(frame DOM) work and message flooding from
Canvas pointer interactions:

1. Ship `instanceIndex` (and the element identity) in the click message from
   the renderer (`rendererElementSelector.ts:299-342`) so the controller
   skips its own full-frame `querySelectorAll` + filter
   (`rendererSelectionProxy.ts:34-44`).
2. Replace the per-hover full-frame `querySelectorAll("[data-cid]")` in the
   renderer (`rendererElementSelector.ts:92-99`) with a `data-cid` → element
   index maintained via a MutationObserver (or lazy WeakMap refreshed only
   on mutation).
3. Frame-throttle `element-hover` postMessages like the existing drag
   throttle (`rendererElementSelector.ts:126-162` vs `:168-173`); drop the
   controller-side re-scan per hover (`CanvasElementOverlay.tsx:83-90`) by
   trusting the renderer's rects.
4. Frame-throttle pan-move messages (`rendererBootstrap.ts:202-214`).

## Acceptance criteria

- [ ] Clicking a card element costs one message round-trip and no
      controller-side frame scan.
- [ ] Hover sends at most one message per frame; renderer hover cost does
      not scan the frame document.
- [ ] Pan messages are frame-throttled.
- [ ] Unit tests cover the identity/index cache (mutation refresh,
      instanceIndex correctness across reorders) and message schema changes.
- [ ] Canvas e2e tests (hover overlay, click select, drag, pan) still pass.
- [ ] Harness (0041) or a canvas-specific spec: hover/click within a large
      card stays within a frame budget.
- [ ] `pnpm lint`, `pnpm typecheck`, unit tests, and
      `pnpm --filter sandbox build` pass; production bundle unchanged
      (ADR-0002).

## Out of scope

- Inspect-mode reveal/commit paths (0042–0046).
- Edit projection through frames (0044 covers the shared apply path).

## Blocked by

- 0041 — Large-app performance harness.
