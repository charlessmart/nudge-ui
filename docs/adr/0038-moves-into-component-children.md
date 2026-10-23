# ADR-0038: Moves into component children name the invocation

Date: 2026-10-23
Status: Accepted

## Context

A structural move records its source and destination parents as rendered
instances, addressed by the parent element's source site. The compiler stamps
`data-src` at the JSX that produced an element, so a component's root element
carries the location of the component's definition. Its children, though, are
authored where the component is used:

```tsx
// Page.tsx
<Stack gap="md">
  <Heading />
  <p>Moved here</p>
</Stack>
```

Dropping an element into a rendered `<Stack>` therefore produced a prompt that
asked the agent to move it "into Stack (src/ui/Stack.tsx:8)". An agent that
edits that file hard-codes the element into every `Stack` in the application.
When the drop had a sibling anchor, its `data-src` hinted at the right file;
a drop at the end of the children, or into an empty component, had no such
hint.

Components that spread their props onto their root are unaffected: the root
carries the callsite's identity tags, so its source site is already the place
of use. ADR-0031 added `rootInvocations(element)` to runtime Adapters, and
`inspect(element)` already reports every enclosing invocation with its
callsite.

## Decision

**A move may name the invocation whose children a parent renders.**
`StructuralMove.source` and `StructuralMove.destination` gain an optional
`childrenOf: InvocationRef`. It is descriptive only: the parent stays
addressed by its rendered-instance ref, and preview, replay and verification
resolve it exactly as before.

**Capture infers the slot from where the children were authored.** A parent
renders an invocation's children when a child authored in it (the moved
element for the source; the anchor, or else the last tagged child, for the
destination) comes from a different file than the parent's own JSX. The slot
belongs to the nearest enclosing invocation whose callsite is in the child's
file and precedes the child. That covers components that render children
into their root and those that render them deeper inside their own markup.
An empty parent has no authored child, so the nearest root invocation whose
callsite differs from the parent's own source site is assumed to render its
children there.

**The prompt edits the callsite.** A parent with `childrenOf` is described as
"the children of the `<Stack>` invocation at src/Page.tsx:12:5".

## Consequences

- Moves into and out of project components, and package components whose
  markup is traced, hand off as edits at the place of use.
- Inference needs a runtime Adapter that reports invocations. Without one, or
  when no enclosing invocation matches, the move keeps its previous wording.
- An empty component that does not render `children` is still described as
  taking the element as a child; the agent has to add that support.
- A component that transforms its children (wrapping each child, inserting
  separators) previews the raw DOM insertion, which may differ from what the
  component would render.
- The moved element and the anchor are still described by their own source
  sites, so reordering component instances relies on their evidence.
- Elements inside package components that do not forward identity tags have
  no source site and remain undroppable.
- Persisted moves without `childrenOf` keep their meaning.
