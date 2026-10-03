# ADR-0034: Frame content, route discovery, and agent activity

Date: 2026-10-03
Status: Accepted
Supersedes: Frame identity in ADR-0027 and ADR-0032

## Decision

A frame owns geometry and references a discriminated content identity: a live
route or an HTML study. Content selects the renderer document, refresh policy,
and edit destination. Study provenance does not identify a live route. Draft
ownership remains separate from both geometry and rendering identity. One
frame-to-draft association is authoritative; no duplicate content association
is persisted by the draft store.

The unified session undo timeline continues to replay edits and frame creation
across drafts, focusing the relevant frame. Adding selected pages as a grid
creates one timeline entry. Draft revisions remain mutable consistency counters.
There is no saved-version feature in this change. Any future saved version must
have an immutable identity and immutable captured state.

Agent activity is an ephemeral, project- and request-scoped layer. The companion
accepts reports only for the current working request; activity cannot dispatch,
complete, or reconcile a task. MCP agents report file reads and edits through
`nudge_report_activity`. Reads expire after eight seconds and edits after twelve.
Dispatch decorates submitted frames until the request ends. Rendered source
identities attribute operations to every matching live frame. Source ranges and
component IDs narrow edit shimmer; studies match their own document path. Task
completion or disconnect removes the layer. No activity enters storage or undo.
The development-only renderer uses the Libraries.dev BorderBeam component.

Route discovery requires no Nudge configuration. Astro supplies its resolved
page registry. Next.js discovery follows App Router and Pages Router conventions,
including configured page extensions and `basePath`. Vite and static HTML hosts
list HTML entry pages. Arbitrary client router code is not evaluated or inferred.
Dynamic route patterns are visible but cannot be added without concrete URLs.
The picker searches discovered pages and adds selected routes as a grid below
existing frames. Discovery runs when the picker opens and is dev-only.

Session schema 15 stores content identities instead of optional artifact flags.
Earlier layout schemas are discarded under ADR-0022; project-local study files
and the draft store remain independently durable.

## Consequences

Route and study behavior no longer depends on the presence of a frame-level
artifact field. Agent operation reports improve attribution without becoming an
alternate task state machine. Framework discovery remains bounded and honest
about routes it cannot resolve, leaving config-based states and saved versions
for separate changes.
