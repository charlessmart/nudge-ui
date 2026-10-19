# ADR-0036: Managed preview specificity

Date: 2026-10-20
Status: Accepted

## Context

Edits preview through a managed stylesheet that cascades after the page's own
stylesheets. Its selectors identify the source site with two attributes, such
as `[data-cid="Button"][data-src="src/App.tsx:1:1"]`, which weigh (0,2,0).
Load order only breaks ties, so any author rule that is more specific wins.
A nested selector such as `.landing a.button`, at (0,2,1), blocked every
preview of the properties it set, and the Changes list reported the edit as
blocked by higher specificity.

Marking managed declarations `!important` would beat those rules, but it would
also override the page's `:hover` and `:focus` rules, CSS animations, and
inline styles that the page sets at runtime. The preview would then show a
cascade that the source edit does not produce. Cascade layers cannot help,
because unlayered page rules beat layered ones.

## Decision

When managed rules are projected, each selector branch is raised just enough
to tie the strongest author rule that sets an overlapping property on the
branch's current targets. The managed sheet cascades last, so the tie goes to
the edit.

- Properties overlap when they share a longhand, so `background` competes
  with `background-color`.
- A selector list competes with its strongest branch that matches the target.
- A base-state edit competes only with rules that apply without an interaction
  state, so the page's `:hover` and `:focus` rules, which are one pseudo-class
  stronger, keep working. An edit for an interaction state competes with base
  rules and rules for that state.
- Rules inside cascade layers, `!important` rules, and inspector-owned
  stylesheets do not compete. `!important` and inline-style conflicts remain
  reported conflicts.
- Class-level weight is added with `:not([data-nudge-ui-boost])` and ID-level
  weight with `:not(#nudge-ui-boost)`. Both always match.
- Selectors with a pseudo-element are not raised.

The host page raises its structured rules before writing them. Canvas
renderers receive serialized CSS, so they raise the selectors of the inserted
sheet in place.

## Consequences

Previews match the source edit's intent on pages with nested or compound
selectors, without overriding interaction states. Raised selectors are
document-local and never reach source edits or prompts.

The boost is computed when rules are projected. A page stylesheet that becomes
more specific later, through hot reload for example, can block a preview again
until the next projection.
