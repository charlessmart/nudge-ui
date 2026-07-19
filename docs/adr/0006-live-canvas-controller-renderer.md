# ADR-0006: Live Canvas controller/renderer via same-origin iframes

Date: 2026-07-19
Status: Accepted

## Context

`PLAN.md` originally described Canvas v1 as a screenshot gallery using
`html2canvas` to capture viewport snapshots for before/after comparison. During
Milestone 4 planning, the team determined that static screenshots cannot show
live design token changes, responsive behaviour, route navigation, or
interactive application state. A live preview approach was chosen instead.

The feature plan `docs/features/live-canvas-workspace.md` describes a board of
same-origin iframe previews, each running the real application with the current
canonical design changes projected into it. This requires splitting the dev
bootstrap into two distinct roles: the **top-level controller** that owns
editing authority, and lightweight **embedded renderers** that display previews
without mounting a second inspector.

## Decision

Canvas uses same-origin Vite dev-server iframes with an explicit
controller/renderer boundary:

1. **Role detection at bootstrap**: the dev bootstrap inspects `frameElement`.
   If the frame element carries `data-design-tool-canvas-renderer`, the document
   is a Canvas renderer. Otherwise it is the top-level controller.

2. **Controller owns all editing authority**: the top-level document owns the
   inspector, element selection, canonical changes, undo/redo, managed
   stylesheet, and the parent side of the preview protocol.

3. **Renderer displays previews only**: a renderer does not mount an inspector,
   selection overlay, panel layout, keyboard shortcut handlers, or persistence
   owner. It announces readiness to its parent and listens for style projections.

4. **Shared edit projection via postMessage**: the controller serializes the
   canonical change set to CSS and sends it to renderers over a versioned
   `postMessage` protocol. Renderers replace their managed stylesheet on receipt.
   ADR-0003 (managed stylesheet, no inline writes) and ADR-0005 (contextual
   selectors for global token previews) continue to govern CSS generation.

5. **No screenshot capture in v1**: `html2canvas` is not used. The live-frame
   approach provides usable interactive previews. Screenshot capture, frozen
   states, visual diffing, and PNG export are deferred.

6. **Single-origin, Vite-only**: only same-origin Vite dev-server routes are
   supported. Cross-origin previews, multiple dev servers, and microfrontend
   composition are deferred.

## Consequences

- The `PLAN.md` milestone description for Canvas is updated from "snapshot
  gallery via html2canvas" to "live same-origin iframe previews controlled by
  the top-level inspector."

- Every dev HTML response receives the inspector bootstrap. The bootstrap MUST
  distinguish a Canvas renderer from the top-level controller. Merely being in
  any iframe is insufficient, because host applications may contain their own
  frames. The explicit `data-design-tool-canvas-renderer` marker distinguishes
  Design Tool Canvas iframes from ordinary application iframes.

- The canvas workspace and all renderer logic remain gated behind
  `import.meta.env.DEV` per ADR-0002. Production builds contain zero Canvas UI,
  frame markers, runtime protocol, or inspector state.

- The renderer role is intentionally thin. It must not grow to own edit state,
  prompting logic, or cross-frame persistence. Any feature that requires the
  renderer to make decisions about canonical changes must be implemented in the
  controller and communicated through the protocol.
