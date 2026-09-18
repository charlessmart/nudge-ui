# ADR-0027: Iframe-first editor workspace

Date: 2026-09-18
Status: Accepted

Nudge uses one iframe-based editing workspace for normal development. A dedicated
same-origin editor document owns the inspector and canonical changes; the
application runs inside a renderer iframe. This removes the separate inline
application editing path and gives viewport units, fixed positioning, and
responsive styles a viewport that does not include the inspector panel.

This decision supersedes ADR-0006's assignment of the application managed
stylesheet to the top-level controller and its restriction on renderer input
handling. The controller owns edit intent, persistence, and undo history;
renderers apply projections and report interactions to it. It also supersedes
ADR-0012's Astro exclusion: Vite, Next.js, Astro, and static HTML all serve the
editor entry document and support application frames. ADR-0016's explicit
single-document public landing demo remains unchanged.

The editor starts with a focused preview at 100% zoom, without an inset and with square
corners. Its viewport follows the space available beside the inspector as the
browser resizes. A header control switches to the canvas with a short zoom-out
transition; canvas previews retain their resize handles. Focus and Canvas are
presentations of the same mounted renderer, sharing editing and document
ownership. Switching presentation must preserve application state. All preview
frames have square corners, and motion respects the reduced-motion preference.
Application links navigate within their frame. Renderer-reported URL changes
update the saved route without reloading the application, preserving client-side
state. **Open app** opens a separate application tab with an explicit
editor-bypass URL marker.

The editor's public URL preserves the application path, query, and hash and
adds `nudge-ui=editor`. Development hosts serve the shell for marked HTML
document requests; the renderer receives the application URL without that
marker. The reserved editor endpoint remains available for existing links,
and internal client and transport endpoints remain in the reserved namespace.

The iframe boundary requires document-aware selection, keyboard routing,
component runtime lookup, and verification. Application projections belong only
in application documents. A missing element in one preview does not prove that
an agent implemented a deletion: the preview might show a different route or
state. Deletion records therefore remain pending when route applicability cannot
be established. Multiple previews remain available for route and
variation comparison, but each runs an application instance. Cross-origin
previews, component-state orchestration, and a stateful design canvas remain
outside this decision. Normal production builds retain the existing dev-only
gating.
