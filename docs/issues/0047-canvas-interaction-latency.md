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

- [x] Clicking a card element costs one message round-trip and no
      controller-side frame scan.
- [x] Hover sends at most one message per frame; renderer hover cost does
      not scan the frame document.
- [x] Pan messages are frame-throttled.
- [x] Unit tests cover the identity/index cache (mutation refresh,
      instanceIndex correctness across reorders) and message schema changes.
- [x] Canvas e2e tests (hover overlay, click select, drag, pan) still pass.
- [x] Harness (0041) or a canvas-specific spec: hover/click within a large
      card stays within a frame budget.
- [x] `pnpm lint`, `pnpm typecheck`, unit tests, and
      `pnpm --filter sandbox build` pass; production bundle unchanged
      (ADR-0002).

## Out of scope

- Inspect-mode reveal/commit paths (0042–0046).
- Edit projection through frames (0044 covers the shared apply path).

## Blocked by

- 0041 — Large-app performance harness.

## Results (2026-08-01, harness median of 3)

Measured by the new canvas perf spec (`tests/perf.canvas.dev.spec.ts`) against
the 600-node perf fixture in a canvas card (`/?perf=large`).

| Metric | Before 0047 | After 0047 | Budget |
| --- | --- | --- | --- |
| Canvas hover latency | 7.8 ms | 7.3 ms | 100 ms — PASS |
| Canvas click latency | 5.9 ms | 6.4 ms | 100 ms — PASS |
| Hover messages (50 leaf events) | 50 | 1 | ≤ 2 — PASS |

Delivered by: `instanceIndex` shipped in the click message
(`frameProtocol.ts`) and resolved controller-side with a scoped
`[data-cid="..."]` engine query (`rendererSelectionProxy.ts`), so a click is
one message round-trip with no full-frame scan or filter; a `data-cid` →
ordered-element index invalidated by a MutationObserver
(`rendererCidIndex.ts`) replaces the per-hover `querySelectorAll` + filter in
the renderer; `element-hover` and `pan-move` postMessages are frame-throttled
(`rendererElementSelector.ts`, `rendererBootstrap.ts`); and the controller
trusts the renderer's hover rects (`CanvasElementOverlay.tsx`) instead of
re-resolving the hovered element per message — the measurement self-rulers
exclusion now compares element identities rather than DOM references.

Verification: 964 unit tests (866 inspector + 98 plugin; 10 new),
`pnpm lint`, `pnpm typecheck`, sandbox build with identical dist hashes
(`index-D0sGTtXL.css` / `index-BKTszAt1.js`) and 0 dev-only matches in the
production bundle (ADR-0002). Canvas e2e (`--project=dev -g "canvas"`): 49
passed; the only failure is the pre-existing `m4-canvas-workspace-ownership:221`
(confirmed failing on the unmodified baseline). Existing perf budgets hold
(cold reveal 34.7ms / warm 19.7ms / commit 3.3ms / growth 0.70x).
