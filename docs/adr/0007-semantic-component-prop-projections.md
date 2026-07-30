# ADR-0007: Semantic component prop projections

Date: 2026-07-29
Status: Accepted
Supersedes: ADR-0003 only where it says every visual edit must be represented
as a managed stylesheet rule

## Context

ADR-0003 correctly prevents CSS previews from mutating inline styles. A
component-level design decision such as `variant="primary"` to
`variant="secondary"` cannot be represented faithfully as a CSS rule: the
component may change classes, markup, accessibility attributes, children, or
behavior when the prop changes.

Treating this intent as a collection of inferred CSS edits would lose the
component contract and could preview a state the real component never renders.

## Decision

Keep the managed stylesheet as the only projection for CSS property and token
changes. Add a separate semantic projection for component prop changes.

A semantic prop preview:

- is recorded as a canonical `component-prop` change at the authored invocation
  callsite;
- is applied by a framework runtime Adapter that rerenders the real component
  with an override;
- never mutates a rendered host element's inline style or application-owned
  attributes;
- remains dev-only under ADR-0002; and
- preserves typed values, source authorship kind, and component contract
  identity for undo, persistence, and prompt generation.

The inspector consumes a framework-neutral component target and change model.
React is the first runtime Adapter. Vue, Svelte, and other source syntaxes
require their own source and runtime Adapters rather than conditionals in the
Inspector.

## Consequences

- ADR-0003 remains fully authoritative for CSS previews.
- The canonical change set can project to more than one runtime mechanism.
- Component invocation identity is distinct from rendered host-element source
  identity.
- Canvas requires a structured semantic projection before component changes
  can be mirrored into renderer frames.
- Only scalar props with a known contract are editable initially.

## Verification

- A React/Vite fixture changes typed enum and boolean props and observes the
  real component rerender.
- Semantic prop changes produce no managed stylesheet declaration.
- Undo, revert, durable session serialization, and prompt output retain
  component callsite identity.
- Production transforms inject no component runtime instrumentation.
