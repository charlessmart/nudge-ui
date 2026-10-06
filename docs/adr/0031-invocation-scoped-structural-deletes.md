# ADR-0031: Invocation-scoped structural deletes

Date: 2026-10-07
Status: Accepted

## Context

A structural delete identifies its target by source site (`data-cid` and
`data-src`) plus bounded evidence: JSX attributes, text, and accessible name.
The compiler stamps `data-src` at the JSX that produced an element, so every
use of a shared component renders a root element with the same source site.
When those outputs also have identical evidence, resolution reports
`ambiguous` and the delete never applies. The occurrence index is not used as
identity because previews and re-renders can shift it.

The compiler already wraps local component invocations in a runtime boundary
that carries a `callsiteId`. Component prop edits and inline text edits use
it. Structural deletes do not, although removing a component's whole output
is what a user means when deleting that output from one parent.

## Decision

Keep `data-src` at the producing JSX. Style and class edits still target the
component's own markup.

Host runtime Adapters may implement `rootInvocations(element)`. It returns,
nearest first, the invocations whose entire rendered output is that element.
It returns null when the runtime cannot read the element's ancestry. The React
Adapter walks the fiber chain upward, stops at the first parent host element,
and stops at any invocation that renders more than one host output.

When evidence alone resolves a delete target as `ambiguous`, capture adds
`locator.invocation` to the `RenderedInstanceRef`. It records the nearest root
invocation that makes resolution unique, with its `callsiteId` and
`componentName`. Resolution with an invocation keeps only evidence-matching
candidates whose root invocations include that callsite. Any candidate whose
ancestry cannot be read makes the result `ambiguous`, never `missing`.

The prompt asks the agent to remove that invocation and keep its others.

## Consequences

- Deleting a shared component's root element from one parent previews and
  hands off as removing one invocation.
- Elements nested inside a shared component's output, invocations repeated by
  a list, and hosts without a runtime Adapter remain `ambiguous`.
- A delete verifies after handoff only when the recorded invocation's output
  is gone. Removing a different invocation leaves the record unverified.
- `callsiteId` is a line and column, so it is as stable as `data-src`.
- Moves and rendered-instance style overrides do not record invocations yet.
- Persisted records without `invocation` keep their meaning.
