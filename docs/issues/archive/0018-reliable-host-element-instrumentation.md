# 0018 — Reliable host-element instrumentation

**Labels:** needs-triage
**Type:** AFK
**Milestone:** 2 — Core loop reliability

## What to build

Make selectable DOM identity independent of custom React components forwarding
unknown props. The transform must annotate host JSX elements (`div`, `button`,
and other DOM tags) with their enclosing React component and definition-site
metadata. Metadata injected on a custom JSX invocation may supplement this, but
must not be required for selection or source attribution because a component
can legitimately discard `data-*` props.

Preserve the current `data-*` identity rule and dev-only contract. Treat React
fiber metadata as optional supporting evidence, not the load-bearing identity
mechanism. Add a sandbox fixture where a custom `Button` destructures its props
without spreading the remainder; its rendered host button must still be
selectable and attributable to the `Button` definition.

## Acceptance criteria

- [x] Every transformed host JSX element receives enclosing-component and definition-site identity in development
- [x] Selection works when the custom component invocation does not forward injected `data-*` props
- [x] Custom JSX invocation metadata is treated as optional call-site evidence, not required DOM identity
- [x] Nested and repeated components resolve to the correct host definition site
- [x] Fiber internals are never required for a successful selection
- [x] Existing identity attributes authored by the host application are not overwritten
- [x] Unit tests cover non-forwarding components, nested components, fragments and repeated render sites
- [x] Sandbox e2e coverage selects a DOM element rendered by a non-forwarding custom component
- [x] All instrumentation is absent from the production bundle
- [x] `pnpm lint`, `pnpm typecheck`, unit tests and `pnpm --filter sandbox build` pass

## Blocked by

None — can start immediately.
