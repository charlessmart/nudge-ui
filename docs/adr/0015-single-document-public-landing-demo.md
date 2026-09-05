# ADR-0015: Single-document public landing demo

- Status: Accepted
- Date: 2026-09-05
- Supersedes: ADR-0014 for the landing page's document boundary

## Context

The public landing page needs to demonstrate the actual Nudge inspector while
letting visitors select and edit the landing page itself. ADR-0014 placed the
interactive demo in a same-origin iframe so the parent page could remain an
inert marketing document. That boundary makes the demo harder to understand:
the visitor edits a separate `DemoPage` instead of the page they are reading.

The landing application already has an explicit `nudgeUi({ demo: true })`
opt-in and builds with the `nudge-demo` mode. The inspector can mount into any
document through `#nudge-ui-root`, and the demo runtime already excludes the
Canvas workspace, workspace lease, persistence, and agent bridge.

## Decision

The landing document is the public demo surface. The explicit landing demo
runtime mounts the real inspector on the landing page's root document in both
development and the `nudge-demo` build. The landing page no longer embeds a
separate `DemoPage` iframe.

The inspector starts collapsed and exposes only its floating restore button.
The landing page's `Open Nudge` CTA sends a document-local open request that
the explicit demo runtime handles by opening the existing inspector panel.

The demo runtime remains a static inspector runtime:

- Canvas stays disabled.
- Workspace leasing and persistence stay disabled.
- The agent bridge stays inert.
- Changes remain browser-local previews.

Normal consumer production builds and landing builds that do not use the
explicit demo opt-in remain governed by ADR-0002. The existing
`?nudgeDemo=1` flag remains available for explicit demo-route previews.

## Consequences

- Visitors can select elements in the page they are reading, without a frame
  boundary or cross-document coordination.
- The explicit landing artifact intentionally ships the inspector runtime and
  transformed identity metadata.
- The fixed inspector reserves its panel width while open, so the landing
  layout must remain usable at narrow viewport sizes.
- The landing page no longer needs a public `DemoPage` component or a second
  document to explain the inspector.
